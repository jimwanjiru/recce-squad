import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { createDatabase } from "../backend/src/config/database.js";
import { organizationLock } from "../backend/src/services/organization-lock.js";
import { readWorkbook, seal } from "./workbook-import-data.cjs";
import type { Prisma } from "@prisma/client";
async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      commit: { type: "boolean" },
      sha256: { type: "string" },
      actor: { type: "string", default: "admin@recce.local" },
      "backup-confirmed": { type: "boolean" },
    },
  });
  if (!values.file) throw new Error("FILE_REQUIRED");
  const workbook = await readWorkbook(values.file);
  console.log(
    JSON.stringify({ sha256: workbook.sha256, ...workbook.summary }, null, 2),
  );
  if (!values.commit) {
    console.log(
      "Preview only: no database changes. Rank, assignments, statuses, finance and uncertain fields remain staged for review.",
    );
    return;
  }
  if (values.sha256 !== workbook.sha256)
    throw new Error("PREVIEW_SHA256_REQUIRED_OR_FILE_CHANGED");
  if (!values["backup-confirmed"])
    throw new Error("BACKUP_CONFIRMATION_REQUIRED");
  const url = new URL(process.env.DATABASE_URL || "");
  if (
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("LOCAL_DATABASE_REQUIRED");
  const db = createDatabase();
  try {
    const result = await db.$transaction(
      async (tx) => {
        await organizationLock(tx);
        const actor = await tx.user.findUnique({
          where: { email: values.actor },
          include: {
            roles: {
              include: {
                role: {
                  include: { permissions: { include: { permission: true } } },
                },
              },
            },
          },
        });
        const grants = new Set(
          actor?.roles.flatMap((r) =>
            r.role.permissions.map((p) => p.permission.code),
          ) || [],
        );
        const needed = [
          "imports.commit",
          "officers.create",
          "fields.import_source.write",
          "fields.payroll_number.write",
          "fields.national_id.write",
          "fields.date_of_birth.write",
          "fields.date_enlisted.write",
          "fields.gender.write",
          "fields.phone.write",
          "fields.education.write",
        ];
        if (!actor?.isActive || needed.some((p) => !grants.has(p)))
          throw new Error("IMPORT_ACTOR_NOT_AUTHORIZED");
        const prior = await tx.importBatch.findFirst({
          where: {
            fileSha256: workbook.sha256,
            status: { not: "ROLLED_BACK" },
          },
        });
        if (prior)
          return {
            alreadyImported: true,
            batchId: prior.id,
            created: prior.importedRows,
            held: prior.rejectedRows,
          };
        await mkdir(".local", { recursive: true, mode: 0o700 });
        const keyPath = ".local/workbook-import.key";
        let key: Buffer;
        try {
          key = await readFile(keyPath);
        } catch (e: any) {
          if (e.code !== "ENOENT") throw e;
          if (await tx.importBatch.count())
            throw new Error("EXISTING_IMPORTS_REQUIRE_ORIGINAL_ENCRYPTION_KEY");
          try {
            await writeFile(keyPath, randomBytes(32), {
              flag: "wx",
              mode: 0o600,
            });
          } catch (e: any) {
            if (e.code !== "EEXIST") throw e;
          }
          key = await readFile(keyPath);
        }
        if (key.length !== 32) throw new Error("INVALID_IMPORT_ENCRYPTION_KEY");
        const batch = await tx.importBatch.create({
          data: {
            filename: "RECCE workbook (local source)",
            fileSha256: workbook.sha256,
            uploadedById: actor.id,
            totalRows: workbook.summary.candidateOfficers,
            status: "IMPORTING",
          },
        });
        let created = 0,
          held = 0,
          existing = 0;
        const staged: Prisma.ImportRowCreateManyInput[] = [];
        for (const row of workbook.rows) {
          let officerId: string | undefined,
            status = "SOURCE_ONLY";
          const errors = [...row.errors];
          if (row.candidate) {
            status = "HELD";
            if (row.candidate.eligible) {
              const duplicate = await tx.officer.findUnique({
                where: { forceNumber: row.candidate.data.forceNumber },
              });
              if (duplicate) {
                existing++;
                errors.push("EXISTING_FORCE_NUMBER_NOT_OVERWRITTEN");
              } else {
                const officer = await tx.officer.create({
                  data: {
                    ...row.candidate.data,
                    ...(row.candidate.education
                      ? { education: { create: row.candidate.education } }
                      : {}),
                  },
                });
                officerId = officer.id;
                status = "CORE_IMPORTED_REVIEW_PENDING";
                created++;
              }
            }
            if (!officerId) held++;
            errors.push("HISTORIES_AND_UNMAPPED_FIELDS_REQUIRE_REVIEW");
          }
          const context = `${workbook.sha256}:${row.sheet}:${row.row}`;
          staged.push({
            batchId: batch.id,
            sheetName: row.sheet,
            rowNumber: row.row,
            rawData: seal(row.raw, key, context),
            unresolvedDates: seal(row.dates, key, context + ":dates"),
            originalRankSpelling: row.originalRank?.slice(0, 191) || null,
            verificationStatus: "UNVERIFIED",
            validationErrors: errors,
            status,
            officerId,
          });
        }
        for (let i = 0; i < staged.length; i += 100)
          await tx.importRow.createMany({ data: staged.slice(i, i + 100) });
        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status: "CORE_IMPORTED_REVIEW_PENDING",
            importedRows: created,
            rejectedRows: held,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: "WORKBOOK_CORE_IMPORTED",
            entityType: "ImportBatch",
            entityId: batch.id,
            changedFields: ["officers", "education", "encryptedSourceStaging"],
          },
        });
        return {
          alreadyImported: false,
          batchId: batch.id,
          created,
          held,
          existingPreserved: existing,
          sourceRowsStaged: staged.length,
        };
      },
      { timeout: 180000, maxWait: 15000 },
    );
    console.log(JSON.stringify(result, null, 2));
    console.log(
      "Keep .local/workbook-import.key with protected backups. Imported officers are UNVERIFIED; no personnel policies or historical effective dates were activated.",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  // Whitelist our codes; never print driver messages, paths, SQL parameters or row values.
  const code = /^[A-Z][A-Z0-9_]+$/.test(error?.message || "")
    ? error.message
    : /^[A-Z0-9_]+$/.test(String(error?.code))
      ? error.code
      : "CHECK_WORKBOOK_CONFIGURATION_AND_MIGRATIONS";
  console.error("Workbook import failed:", code);
  process.exitCode = 1;
});
