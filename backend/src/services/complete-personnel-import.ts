import { Prisma } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { organizationLock } from "./organization-lock.js";
import {
  openSource,
  checkSourceOfficer,
  sourceText,
} from "./workbook-source.js";
import { seedOfficerRanks } from "./seed-officer-ranks.js";
import type { SourceRow } from "../../../tools/workbook-import-data.cjs";
import { sealSource as seal } from "./workbook-source.js";

// Resolve cached cell values only. Missing formula results remain unavailable;
// formulas (including external references) are never executed by the application.
export function personnelCell(
  raw: Record<string, any>,
  column: number,
): string {
  let value = raw[String(column)];
  if (
    value &&
    typeof value === "object" &&
    ("formula" in value || "sharedFormula" in value)
  )
    value = value.result;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "number" &&
    /^0+$/.test(raw._numberFormats?.[String(column)] || "") &&
    Number.isSafeInteger(value) &&
    value >= 0
  )
    return String(value).padStart(
      raw._numberFormats[String(column)].length,
      "0",
    );
  return sourceText(value);
}
export const personnelMappingVersion = 2;
export async function completePersonnelImport(
  tx: Prisma.TransactionClient,
  input: {
    batchId: string;
    sha256: string;
    actorEmail: string;
    rows: SourceRow[];
    commit: boolean;
  },
) {
  await organizationLock(tx);
  const actor = await tx.user.findUnique({
    where: { email: input.actorEmail },
    include: {
      roles: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });
  const grants = new Set(
    actor?.roles.flatMap((r) =>
      r.role.permissions.map((p) => p.permission.code),
    ) || [],
  );
  const required = [
    "imports.commit",
    "officers.update",
    "fields.import_source.view",
    "fields.import_source.write",
    "fields.assignments.write",
    "fields.ethnicity.write",
    "fields.county.write",
  ];
  // All copied fields retain their existing individual read/write protection.
  const { workbookColumns } = await import("./workbook-source.js");
  for (const [, permission] of workbookColumns)
    if (permission)
      required.push(`fields.${permission}.view`, `fields.${permission}.write`);
  if (!actor?.isActive || required.some((p) => !grants.has(p)))
    throw Error("IMPORT_ACTOR_NOT_AUTHORIZED");
  const batch = await tx.importBatch.findUnique({
    where: { id: input.batchId },
  });
  if (!batch || batch.status === "ROLLED_BACK")
    throw Error("IMPORT_BATCH_NOT_FOUND");
  if (batch.fileSha256 !== input.sha256)
    throw Error("IMPORT_BATCH_CHECKSUM_MISMATCH");
  const candidates = input.rows.filter(
    (r) => r.sheet.trim() === "NAMES" && r.candidate,
  );
  if (!candidates.length || candidates.some((r) => !r.candidate!.eligible))
    throw Error("ALL_OFFICERS_MUST_BE_LINKED_WITHOUT_HELD_ROWS");
  const staged = await tx.importRow.findMany({
    where: { batchId: batch.id, sheetName: "NAMES", officerId: { not: null } },
    include: { officer: true },
  });
  if (
    staged.length !== candidates.length ||
    new Set(staged.map((r) => r.officerId)).size !== candidates.length ||
    batch.importedRows !== candidates.length ||
    batch.rejectedRows !== 0
  )
    throw Error("EXISTING_BATCH_OFFICER_COUNT_MISMATCH");
  const byRow = new Map(staged.map((r) => [r.rowNumber, r]));
  const key = await readFile(
    process.env.WORKBOOK_IMPORT_KEY_PATH || ".local/workbook-import.key",
  );
  if (key.length !== 32) throw Error("INVALID_IMPORT_ENCRYPTION_KEY");
  let added = 0,
    preserved = 0,
    upgraded = 0,
    fieldsAdded = 0;
  for (const row of candidates) {
    const saved = byRow.get(row.row);
    if (!saved?.officer) throw Error("IMPORT_OFFICER_LINK_MISSING");
    await tx.$queryRaw`SELECT id FROM Officer WHERE id=${saved.officer.id} FOR UPDATE`;
    saved.officer = await tx.officer.findUniqueOrThrow({
      where: { id: saved.officer.id },
    });
    // Force-number matching is authoritative; subsequent manual name edits are retained.
    checkSourceOfficer(row.raw, saved.officer);
    const original = await openSource(
      saved.rawData,
      `${batch.fileSha256}:NAMES:${row.row}`,
    );
    checkSourceOfficer(original, saved.officer);
    const existing = await tx.officerPersonnelData.findUnique({
      where: { officerId: saved.officer.id },
    });
    if (existing && existing.mappingVersion > personnelMappingVersion)
      throw Error("UNSUPPORTED_PERSONNEL_MAPPING_VERSION");
    if (existing && existing.sourceRowId !== saved.id)
      throw Error("PERSONNEL_SOURCE_LINK_MISMATCH");
    const details = {
      ...((existing?.details || {}) as Record<string, string>),
    };
    const finance = existing
      ? ((await openSource(
          existing.encryptedFinance,
          `personnel:${saved.officer.id}:finance`,
        )) as Record<string, string>)
      : {};
    let missing = 0;
    for (let c = 2; c <= 38; c++) {
      if (c === 16) continue; // The editable scalar was populated once by mapping v1.
      const target = c === 36 || c === 37 ? finance : details;
      // An existing empty string or null is an intentional value, never a gap.
      if (!Object.prototype.hasOwnProperty.call(target, String(c))) {
        target[String(c)] = personnelCell(row.raw, c);
        missing++;
      }
    }
    if (
      existing &&
      !missing &&
      existing.mappingVersion >= personnelMappingVersion
    ) {
      preserved++;
      continue;
    }
    fieldsAdded += missing;
    if (existing) upgraded++;
    else added++;
    if (!input.commit) continue;
    const manualEdits = await tx.auditLog.findMany({
      where: {
        entityType: "Officer",
        entityId: saved.officer.id,
        action: "OFFICER_UPDATED",
      },
      select: { changedFields: true },
    });
    const editedFields = new Set(
      manualEdits.flatMap((log) =>
        Array.isArray(log.changedFields)
          ? log.changedFields.filter((v): v is string => typeof v === "string")
          : [],
      ),
    );
    const manualColumns: Record<string, number> = {
      forceNumber: 2,
      payrollNumber: 3,
      fullName: 6,
      dateOfBirth: 8,
      gender: 9,
      dateEnlisted: 11,
      nationalId: 24,
      phone: 27,
    };
    for (const [field, column] of Object.entries(manualColumns))
      if (editedFields.has(field)) {
        const v = saved.officer[field as keyof typeof saved.officer];
        details[String(column)] =
          v instanceof Date ? v.toISOString() : String(v ?? "");
      }
    if (editedFields.has("serviceProfile")) {
      const profile = await tx.officerServiceProfile.findUnique({
        where: { officerId: saved.officer.id },
      });
      details["13"] = profile?.dateJoinedUnit?.toISOString() || "";
      details["23"] = profile?.serviceRemarks || "";
    }
    for (const [field, column, model] of [
      ["countyId", "10", "county"],
      ["ethnicityId", "7", "ethnicity"],
    ] as const) {
      if (editedFields.has(field)) {
        const id = saved.officer[field];
        const record = id
          ? model === "county"
            ? await tx.county.findUnique({ where: { id } })
            : await tx.ethnicity.findUnique({ where: { id } })
          : null;
        details[column] = record?.name || "";
      }
    }
    const payload = {
      details,
      encryptedFinance: seal(
        finance,
        key,
        `personnel:${saved.officer.id}:finance`,
      ),
      mappingVersion: personnelMappingVersion,
    };
    if (existing)
      await tx.officerPersonnelData.update({
        where: { officerId: saved.officer.id },
        data: payload,
      });
    else
      await tx.officerPersonnelData.create({
        data: {
          officerId: saved.officer.id,
          sourceRowId: saved.id,
          ...payload,
        },
      });
    const changes: Prisma.OfficerUncheckedUpdateInput = {};
    // Atomic fill-once: a previously edited or cleared field is never replaced on rerun.
    const current = await tx.officer.findUniqueOrThrow({
      where: { id: saved.officer.id },
    });
    if (
      !existing &&
      current.assignedDuties === null &&
      !editedFields.has("assignedDuties")
    )
      changes.assignedDuties = personnelCell(row.raw, 16) || null;
    if (
      !existing &&
      !current.ethnicityId &&
      !editedFields.has("ethnicityId") &&
      details["7"]
    ) {
      const ethnicity = await tx.ethnicity.upsert({
        where: { name: details["7"] },
        create: { name: details["7"] },
        update: {},
      });
      changes.ethnicityId = ethnicity.id;
    }
    if (
      !existing &&
      !current.countyId &&
      !editedFields.has("countyId") &&
      details["10"]
    ) {
      const county = await tx.county.upsert({
        where: { name: details["10"] },
        create: { name: details["10"] },
        update: {},
      });
      changes.countyId = county.id;
    }
    await tx.officer.update({
      where: { id: current.id },
      data: { ...changes, version: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: existing
          ? "PERSONNEL_DETAILS_UPGRADED"
          : "PERSONNEL_DETAILS_COMPLETED",
        entityType: "Officer",
        entityId: current.id,
        changedFields: ["personnelData", ...Object.keys(changes)],
      },
    });
  }
  let summaryAdded = 0;
  for (const row of input.rows.filter((r) =>
    ["TRIBE", "SUB UNIT STRENGTH"].includes(r.sheet.trim()),
  )) {
    const section = row.sheet.trim();
    const existing = await tx.personnelSummaryRecord.findUnique({
      where: {
        batchId_section_position: {
          batchId: batch.id,
          section,
          position: row.row,
        },
      },
    });
    if (existing) continue;
    const cells: Record<string, string> = {};
    for (const c of Object.keys(row.raw).filter((k) => /^\d+$/.test(k)))
      cells[c] = personnelCell(row.raw, Number(c));
    summaryAdded++;
    if (input.commit)
      await tx.personnelSummaryRecord.create({
        data: { batchId: batch.id, section, position: row.row, cells },
      });
  }
  if (input.commit) {
    await seedOfficerRanks(tx, batch.id, actor.id);
    const approvalKey = `_import.personnel-approved.${batch.id}`;
    if (
      !(await tx.systemSetting.findUnique({
        where: { settingKey: approvalKey },
      }))
    ) {
      await tx.systemSetting.create({
        data: {
          settingKey: approvalKey,
          settingValue: {
            approvedById: actor.id,
            approvedAt: new Date().toISOString(),
            fileSha256: batch.fileSha256,
            scope: ["NAMES", "TRIBE", "SUB UNIT STRENGTH"],
            excluded: ["CHANGES"],
            approval: "USER_APPROVED_DATA",
            version: 1,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: "PERSONNEL_IMPORT_APPROVED",
          entityType: "ImportBatch",
          entityId: batch.id,
          changedFields: ["NAMES", "TRIBE", "SUB UNIT STRENGTH"],
        },
      });
    }
  }
  return {
    officers: candidates.length,
    added,
    preserved,
    upgraded,
    fieldsAdded,
    mappingVersion: personnelMappingVersion,
    summaryAdded,
    changesImported: 0,
    commit: input.commit,
  };
}
