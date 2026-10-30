import { PrismaClient } from "@prisma/client";
import { businessDate } from "./history.js";
import {
  checkSourceOfficer,
  openSource,
  sourceText,
} from "./workbook-source.js";

// Display order only; changing this list never rewrites rank histories or source cells.
export const currentPoliceRanks = [
  "AIG",
  "CP",
  "SSP",
  "SP",
  "ASP",
  "CI",
  "IP",
  "S/SGT",
  "SGT",
  "CPL",
  "PC",
] as const;
export const additionalSourceRanks = ["S/AIG", "RSM"] as const;
export function overallRank(value: unknown): string {
  const code = sourceText(value).trim().toUpperCase().replace(/[.\s]/g, "");
  return [...currentPoliceRanks, ...additionalSourceRanks].includes(code as any)
    ? code
    : "UNKNOWN";
}
export function rankPosition(code: string) {
  const index = currentPoliceRanks.indexOf(overallRank(code) as any);
  return index < 0 ? currentPoliceRanks.length : index;
}
export function compareRankCodes(a: string, b: string) {
  return rankPosition(a) - rankPosition(b) || a.localeCompare(b);
}
export function sortRankReferences<
  T extends { code: string; hierarchyLevel?: number },
>(rows: T[]) {
  return rows.sort(
    (a, b) =>
      rankPosition(a.code) - rankPosition(b.code) ||
      (a.hierarchyLevel ?? 0) - (b.hierarchyLevel ?? 0) ||
      a.code.localeCompare(b.code),
  );
}
export function currentRankReferences<
  T extends { code: string; hierarchyLevel?: number },
>(rows: T[]) {
  return sortRankReferences(
    rows.filter(
      (r) => !additionalSourceRanks.includes(overallRank(r.code) as any),
    ),
  );
}
export type OfficerRanks = {
  rank1: string;
  rank2: string;
  rankSource: "VERIFIED" | "DATABASE" | "WORKBOOK" | "UNRECORDED";
  specialistDesignation?: string | null;
};
export async function officerRanks(
  db: Pick<
    PrismaClient,
    "officerRankHistory" | "officerRankSnapshot" | "importRow"
  >,
  officers: { id: string; forceNumber: string }[],
  allowSource: boolean,
) {
  const result = new Map<string, OfficerRanks>();
  const today = new Date(businessDate() + "T00:00:00Z");
  for (let offset = 0; offset < officers.length; offset += 150) {
    const chunk = officers.slice(offset, offset + 150),
      ids = chunk.map((o) => o.id);
    for (const officer of chunk)
      result.set(officer.id, {
        rank1: "",
        rank2: "UNKNOWN",
        rankSource: "UNRECORDED",
      });
    const verified = await db.officerRankHistory.findMany({
      where: {
        officerId: { in: ids },
        effectiveFrom: { lte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }],
      },
      select: {
        officerId: true,
        originalRankSpelling: true,
        specialistDesignation: true,
        rank: { select: { code: true } },
      },
    });
    const verifiedIds = new Set<string>();
    for (const history of verified) {
      verifiedIds.add(history.officerId);
      result.set(history.officerId, {
        rank1: history.originalRankSpelling || history.rank.code,
        rank2: overallRank(history.rank.code),
        rankSource: "VERIFIED",
        specialistDesignation: history.specialistDesignation,
      });
    }
    const snapshots = await db.officerRankSnapshot.findMany({
      where: {
        officerId: { in: ids.filter((id) => !verifiedIds.has(id)) },
        sourceRow: { batch: { status: { not: "ROLLED_BACK" } } },
      },
    });
    for (const snapshot of snapshots) {
      verifiedIds.add(snapshot.officerId);
      result.set(snapshot.officerId, {
        rank1: snapshot.rank1,
        rank2: snapshot.rankCode,
        rankSource: "DATABASE",
      });
    }
    if (!allowSource) continue;
    const pending = chunk.filter((o) => !verifiedIds.has(o.id));
    if (!pending.length) continue;
    const sources = await db.importRow.findMany({
      where: {
        officerId: { in: pending.map((o) => o.id) },
        sheetName: "NAMES",
        batch: { status: { not: "ROLLED_BACK" } },
      },
      select: {
        id: true,
        officerId: true,
        rawData: true,
        rowNumber: true,
        batch: { select: { fileSha256: true } },
      },
      orderBy: [{ batch: { createdAt: "desc" } }, { id: "desc" }],
    });
    const identities = new Map(pending.map((o) => [o.id, o]));
    const seen = new Set<string>();
    for (const row of sources) {
      if (!row.officerId || seen.has(row.officerId)) continue;
      const raw = await openSource(
        row.rawData,
        `${row.batch.fileSha256}:NAMES:${row.rowNumber}`,
      );
      const officer = identities.get(row.officerId)!;
      try {
        checkSourceOfficer(raw, officer);
      } catch {
        continue;
      }
      seen.add(row.officerId);
      result.set(row.officerId, {
        rank1: sourceText(raw["4"]),
        rank2: overallRank(raw["5"]),
        rankSource: "WORKBOOK",
      });
    }
  }
  return result;
}
