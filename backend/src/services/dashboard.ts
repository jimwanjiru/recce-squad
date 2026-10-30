import { serviceExitStatuses } from "./changes-fields.js";
import { businessDate } from "./history.js";
import { PrismaClient } from "@prisma/client";
import {
  openSource,
  sourceText,
  checkSourceOfficer,
} from "./workbook-source.js";
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
  const label = sourceText(value).trim().toUpperCase();
  const normalized = label === "C.I" || label === "C.I." ? "CI" : label;
  return policeRanks.includes(normalized as any) ? normalized : "UNKNOWN";
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
  const today = new Date(businessDate() + "T00:00:00Z");
  const effective = {
    effectiveFrom: { lte: today },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }],
  };
  const serving = {
    deletedAt: null,
    recordStatus: { notIn: serviceExitStatuses },
  };
  const [totalOfficers, archivedOfficers, needsVerification, formerOfficers] =
    await Promise.all([
      db.officer.count({ where: serving }),
      db.officer.count({ where: { deletedAt: { not: null } } }),
      db.officer.count({
        where: { deletedAt: null, recordStatus: "UNVERIFIED" },
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
  let recce = 0,
    identityMismatches = 0,
    cursor: string | undefined;
  // Bound memory on small laptops. Only one source row per currently registered officer is counted.
  while (true) {
    const rows = await db.importRow.findMany({
      where: {
        sheetName: "NAMES",
        officerId: { not: null },
        officer: serving,
        batch: { status: { not: "ROLLED_BACK" } },
      },
      select: {
        id: true,
        officerId: true,
        rawData: true,
        sheetName: true,
        rowNumber: true,
        batch: { select: { fileSha256: true } },
        officer: {
          select: {
            forceNumber: true,
            rankHistories: {
              where: effective,
              select: { rank: { select: { code: true } } },
              take: 1,
            },
            assignments: {
              where: { ...effective, isPrimary: true },
              select: {
                unit: { select: { code: true } },
                subUnit: { select: { code: true } },
                disposition: true,
              },
              take: 1,
            },
          },
        },
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
      const assignment = row.officer.assignments[0];
      const currentRaw = {
        ...raw,
        5: row.officer.rankHistories[0]?.rank.code || raw["5"],
        20: assignment
          ? assignment.subUnit?.code ||
            assignment.disposition ||
            assignment.unit.code
          : raw["20"],
      };
      const belongsToRecce = tallyOfficer(currentRaw, counts);
      if (belongsToRecce) recce++;
      const rank = sourceRank(currentRaw["5"]);
      rankCounts[rank] = (rankCounts[rank] || 0) + 1;
      if (belongsToRecce)
        recceRankCounts[rank] = (recceRankCounts[rank] || 0) + 1;
      const disposition = code(currentRaw["20"]);
      const group = groupCodes.includes(disposition as any)
        ? disposition
        : disposition
          ? "OTHER"
          : "UNSPECIFIED";
      groupRankCounts[group]![rank] = (groupRankCounts[group]![rank] || 0) + 1;
    }
    if (rows.length < 150) break;
    cursor = rows[rows.length - 1]!.id;
  }
  // Officers registered directly can enter the report through verified assignments/ranks without an Excel row.
  const verifiedOnly = await db.officer.findMany({
    where: {
      ...serving,
      id: { notIn: [...seen] },
      OR: [
        { assignments: { some: { ...effective, isPrimary: true } } },
        { rankHistories: { some: effective } },
      ],
    },
    select: {
      id: true,
      rankHistories: {
        where: effective,
        select: { rank: { select: { code: true } } },
        take: 1,
      },
      assignments: {
        where: { ...effective, isPrimary: true },
        select: {
          unit: { select: { code: true } },
          subUnit: { select: { code: true } },
          disposition: true,
        },
        take: 1,
      },
    },
  });
  for (const officer of verifiedOnly) {
    const assignment = officer.assignments[0];
    const raw = {
      5: officer.rankHistories[0]?.rank.code || "",
      20: assignment
        ? assignment.subUnit?.code ||
          assignment.disposition ||
          assignment.unit.code
        : "",
      22:
        assignment &&
        ["R", "RECCE"].includes(assignment.unit.code.toUpperCase())
          ? "R"
          : "",
    };
    seen.add(officer.id);
    const belongs = tallyOfficer(raw, counts);
    if (belongs) recce++;
    const rank = sourceRank(raw[5]);
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
    if (belongs) recceRankCounts[rank] = (recceRankCounts[rank] || 0) + 1;
    const disposition = code(raw[20]),
      group = groupCodes.includes(disposition as any)
        ? disposition
        : disposition
          ? "OTHER"
          : "UNSPECIFIED";
    groupRankCounts[group]![rank] = (groupRankCounts[group]![rank] || 0) + 1;
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
  const workbookRankCounts: Record<string, number | null> = {},
    workbookEstablishment: Record<string, number | null> = {};
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
      if (label === "TOTAL" && row.rowNumber < 22)
        workbookTotal = cachedNumber(raw["37"]);
    }
  }
  return {
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
