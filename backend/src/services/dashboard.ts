import { currentPersonnel } from "./personnel-records.js";
import { serviceExitStatuses } from "./changes-fields.js";
import { currentPoliceRanks, overallRank } from "./ranks.js";
import { PrismaClient } from "@prisma/client";
import { sourceText } from "./workbook-source.js";
export const policeRanks = [
  "S/AIG",
  "AIG",
  "CP",
  "SSP",
  "SP",
  "ASP",
  "CI",
  "IP",
  "RSM",
  "S/SGT",
  "SGT",
  "CPL",
  "PC",
] as const;
export const strengthRankColumns: Record<string, number> = {
  "S/AIG": 2,
  AIG: 5,
  CP: 8,
  SSP: 11,
  SP: 14,
  ASP: 17,
  CI: 20,
  IP: 23,
  RSM: 24,
  "S/SGT": 27,
  SGT: 30,
  CPL: 33,
  PC: 36,
};
export function sourceRank(value: unknown): string {
  return overallRank(value);
}
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
  NA: "Not assigned / Not applicable",
};
const code = (value: unknown) =>
  sourceText(value).trim().toUpperCase().replace(/\s+/g, "");
export function cachedNumber(value: any): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
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
  db: Pick<PrismaClient, "officer" | "personnelSummaryRecord" | "importBatch">,
) {
  const serving = {
    deletedAt: null,
    recordStatus: { notIn: serviceExitStatuses },
  };
  const [totalOfficers, archivedOfficers, needsVerification, formerOfficers] =
    await Promise.all([
      db.officer.count({ where: serving }),
      db.officer.count({ where: { deletedAt: { not: null } } }),
      db.officer.count({
        where: {
          deletedAt: null,
          recordStatus: "UNVERIFIED",
          verificationStatus: "UNVERIFIED",
        },
      }),
      db.officer.count({
        where: { deletedAt: null, recordStatus: { in: serviceExitStatuses } },
      }),
    ]);
  const counts: Record<string, number> = {};
  for (const c of [...groupCodes, "OTHER", "UNSPECIFIED"]) counts[c] = 0;
  const rankCounts: Record<string, number> = {},
    recceRankCounts: Record<string, number> = {};
  const groupRankCounts: Record<string, Record<string, number>> = {};
  for (const c of [...groupCodes, "OTHER", "UNSPECIFIED"])
    groupRankCounts[c] = {};
  const seen = new Set<string>();
  let recce = 0;
  const identityMismatches = 0;
  const personnel = await currentPersonnel(db);
  for (const { officer, raw } of personnel) {
    seen.add(officer.id);
    const belongsToRecce = tallyOfficer(raw, counts);
    if (belongsToRecce) recce++;
    const rank = sourceRank(raw["5"]);
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
    if (belongsToRecce)
      recceRankCounts[rank] = (recceRankCounts[rank] || 0) + 1;
    const disposition = code(raw["20"]);
    const group = groupCodes.includes(disposition as any)
      ? disposition
      : disposition
        ? "OTHER"
        : "UNSPECIFIED";
    groupRankCounts[group]![rank] = (groupRankCounts[group]![rank] || 0) + 1;
  }
  const batch = await db.importBatch.findFirst({
    where: {
      status: { not: "ROLLED_BACK" },
      summaryRecords: { some: { section: "SUB UNIT STRENGTH" } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, fileSha256: true, createdAt: true },
  });
  const snapshot: Record<string, number | null> = {};
  const workbookRankCounts: Record<string, number | null> = {},
    workbookEstablishment: Record<string, number | null> = {};
  let workbookTotal: number | null = null,
    workbookRecce: number | null = null;
  if (batch) {
    const rows = await db.personnelSummaryRecord.findMany({
      where: { batchId: batch.id, section: "SUB UNIT STRENGTH" },
      orderBy: { position: "asc" },
      take: 100,
    });
    for (const row of rows) {
      const raw = row.cells as Record<string, string>;
      const label = code(raw["1"]);
      if (label === "CURRENTSTRENGTH" || label === "ESTABLISHMENT") {
        const target =
          label === "CURRENTSTRENGTH"
            ? workbookRankCounts
            : workbookEstablishment;
        for (const rank of policeRanks)
          target[rank] = cachedNumber(raw[String(strengthRankColumns[rank])]);
      }
      if (groupCodes.includes(label as any))
        snapshot[label] = cachedNumber(raw["37"]);
      if (label === "R") workbookRecce = cachedNumber(raw["37"]);
      if (label === "TOTAL" && row.position < 22)
        workbookTotal = cachedNumber(raw["37"]);
    }
  }
  return {
    currentRankOrder: currentPoliceRanks,
    totalOfficers,
    archivedOfficers,
    formerOfficers,
    needsVerification,
    recce,
    sourceLinked: seen.size,
    withoutSource: Math.max(0, totalOfficers - seen.size),
    identityMismatches,
    rankBreakdown: [...policeRanks, "UNKNOWN"].map((rank) => ({
      code: rank,
      label: rank === "UNKNOWN" ? "Unmapped / blank rank" : rank,
      count: rankCounts[rank] || 0,
      recceCount: recceRankCounts[rank] || 0,
      workbookCurrent: workbookRankCounts[rank] ?? null,
      workbookEstablishment: workbookEstablishment[rank] ?? null,
      differenceToEstablishment:
        workbookEstablishment[rank] != null
          ? workbookEstablishment[rank]! - (rankCounts[rank] || 0)
          : null,
    })),
    groups: [...groupCodes, "OTHER", "UNSPECIFIED"].map((c) => ({
      code: c,
      label:
        groupLabels[c] ||
        (c === "OTHER" ? "Other source disposition" : "Blank disposition"),
      count: counts[c] || 0,
      ranks: Object.fromEntries(
        [...policeRanks, "UNKNOWN"].map((rank) => [
          rank,
          groupRankCounts[c]![rank] || 0,
        ]),
      ),
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
