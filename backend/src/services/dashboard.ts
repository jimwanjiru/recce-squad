import { PrismaClient } from "@prisma/client";
import {
  openSource,
  sourceText,
  checkSourceOfficer,
} from "./workbook-source.js";
export const groupCodes = [
  "MO",
  "HQS",
  "RRT",
  "CRT",
  "GP1",
  "GP2",
  "GP3",
  "GP4",
  "CTSO",
  "SPEAR",
  "NA",
] as const;
export const groupLabels: Record<string, string> = {
  MO: "Main Office",
  HQS: "HQS",
  RRT: "RRT",
  CRT: "CRT",
  GP1: "GP1",
  GP2: "GP2",
  GP3: "GP3",
  GP4: "GP4",
  CTSO: "CTSO",
  SPEAR: "SPEAR",
  NA: "Not assigned / not applicable",
};
const code = (value: unknown) =>
  sourceText(value).trim().toUpperCase().replace(/\s+/g, "");
export function cachedNumber(value: any): number | null {
  const n =
    typeof value === "number"
      ? value
      : value && typeof value === "object"
        ? value.result
        : null;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
}
export function tallyOfficer(
  raw: Record<string, any>,
  counts: Record<string, number>,
) {
  const disposition = code(raw["20"]);
  const group = groupCodes.includes(disposition as any)
    ? disposition
    : disposition
      ? "OTHER"
      : "UNSPECIFIED";
  counts[group] = (counts[group] || 0) + 1;
  return code(raw["22"]) === "R";
}
export async function dashboardSummary(
  db: Pick<PrismaClient, "officer" | "importRow" | "importBatch">,
) {
  const [totalOfficers, archivedOfficers, needsVerification] =
    await Promise.all([
      db.officer.count({ where: { deletedAt: null } }),
      db.officer.count({ where: { deletedAt: { not: null } } }),
      db.officer.count({
        where: { deletedAt: null, recordStatus: "UNVERIFIED" },
      }),
    ]);
  const counts: Record<string, number> = {};
  for (const c of [...groupCodes, "OTHER", "UNSPECIFIED"]) counts[c] = 0;
  const seen = new Set<string>();
  let recce = 0,
    identityMismatches = 0,
    cursor: string | undefined;
  // Bound memory on small laptops. Only one source row per currently registered officer is counted.
  while (true) {
    const rows = await db.importRow.findMany({
      where: {
        sheetName: "NAMES",
        officerId: { not: null },
        officer: { deletedAt: null },
        batch: { status: { not: "ROLLED_BACK" } },
      },
      select: {
        id: true,
        officerId: true,
        rawData: true,
        sheetName: true,
        rowNumber: true,
        batch: { select: { fileSha256: true } },
        officer: { select: { forceNumber: true } },
      },
      orderBy: { id: "asc" },
      take: 150,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const row of rows) {
      if (!row.officerId || !row.officer || seen.has(row.officerId)) continue;
      const raw = await openSource(
        row.rawData,
        `${row.batch.fileSha256}:${row.sheetName}:${row.rowNumber}`,
      );
      try {
        checkSourceOfficer(raw, row.officer);
      } catch {
        identityMismatches++;
        continue;
      }
      seen.add(row.officerId);
      if (tallyOfficer(raw, counts)) recce++;
    }
    if (rows.length < 150) break;
    cursor = rows[rows.length - 1]!.id;
  }
  const batch = await db.importBatch.findFirst({
    where: {
      status: { not: "ROLLED_BACK" },
      rows: { some: { sheetName: "SUB UNIT STRENGTH" } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, fileSha256: true, createdAt: true },
  });
  const snapshot: Record<string, number | null> = {};
  let workbookTotal: number | null = null,
    workbookRecce: number | null = null;
  if (batch) {
    const rows = await db.importRow.findMany({
      where: { batchId: batch.id, sheetName: "SUB UNIT STRENGTH" },
      orderBy: { rowNumber: "asc" },
      take: 100,
    });
    for (const row of rows) {
      const raw = await openSource(
        row.rawData,
        `${batch.fileSha256}:${row.sheetName}:${row.rowNumber}`,
      );
      const label = code(raw["1"]);
      if (groupCodes.includes(label as any))
        snapshot[label] = cachedNumber(raw["37"]);
      if (label === "R") workbookRecce = cachedNumber(raw["37"]);
      if (label === "TOTAL" && row.rowNumber < 22)
        workbookTotal = cachedNumber(raw["37"]);
    }
  }
  return {
    totalOfficers,
    archivedOfficers,
    needsVerification,
    recce,
    sourceLinked: seen.size,
    withoutSource: Math.max(0, totalOfficers - seen.size),
    identityMismatches,
    groups: [...groupCodes, "OTHER", "UNSPECIFIED"].map((c) => ({
      code: c,
      label:
        groupLabels[c] ||
        (c === "OTHER" ? "Other source disposition" : "Blank disposition"),
      count: counts[c] || 0,
      workbookCached: Object.hasOwn(snapshot, c) ? snapshot[c] : null,
      inStrengthSheet: Object.hasOwn(snapshot, c),
    })),
    workbook: batch
      ? {
          importedAt: batch.createdAt,
          total: workbookTotal,
          recce: workbookRecce,
        }
      : null,
    generatedAt: new Date().toISOString(),
  };
}
