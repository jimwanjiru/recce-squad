import { PrismaClient } from "@prisma/client";
import { groupCodes, groupLabels, sourceRank } from "./dashboard.js";
import {
  openSource,
  sourceText,
  checkSourceOfficer,
} from "./workbook-source.js";
import { compareSeniority } from "./seniority.js";
import { businessDate } from "./history.js";
export const rosterPermissions = [
  "organization.view",
  "officers.view",
  "fields.import_source.view",
  "fields.assignments.view",
  "fields.rank_history.view",
  "fields.service_profile.view",
];
export async function groupRoster(
  db: Pick<PrismaClient, "importRow">,
  query: {
    group: string;
    rank?: string;
    q?: string;
    page: number;
    pageSize: number;
  },
) {
  const counts: Record<string, number> = { RECCE: 0 };
  for (const g of [...groupCodes, "OTHER", "UNSPECIFIED"]) counts[g] = 0;
  const matches: {
    id: string;
    forceNumber: string;
    fullName: string;
    rank: string;
    originalRank: string;
    group: string;
    isRecce: boolean;
    recordStatus: string;
    verifiedRank: string | null;
    verifiedGroup: string | null;
  }[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined,
    identityMismatches = 0;
  const today = new Date(businessDate() + "T00:00:00Z");
  const effective = {
    effectiveFrom: { lte: today },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }],
  };
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
        rawData: true,
        rowNumber: true,
        sheetName: true,
        batch: { select: { fileSha256: true } },
        officer: {
          select: {
            id: true,
            forceNumber: true,
            fullName: true,
            recordStatus: true,
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
      const officer = row.officer;
      if (!officer || seen.has(officer.id)) continue;
      const raw = await openSource(
        row.rawData,
        `${row.batch.fileSha256}:${row.sheetName}:${row.rowNumber}`,
      );
      try {
        checkSourceOfficer(raw, officer);
      } catch {
        identityMismatches++;
        continue;
      }
      seen.add(officer.id);
      const disposition = sourceText(raw["20"])
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
      const group = groupCodes.includes(disposition as any)
        ? disposition
        : disposition
          ? "OTHER"
          : "UNSPECIFIED";
      const isRecce = sourceText(raw["22"]).trim().toUpperCase() === "R";
      counts[group] = (counts[group] || 0) + 1;
      if (isRecce) counts.RECCE = (counts.RECCE || 0) + 1;
      const rank = sourceRank(raw["5"]);
      if (
        query.group !== "ALL" &&
        !(query.group === "RECCE" ? isRecce : group === query.group)
      )
        continue;
      if (query.rank && rank !== query.rank) continue;
      if (
        query.q &&
        !`${officer.forceNumber} ${officer.fullName}`
          .toLocaleLowerCase()
          .includes(query.q.toLocaleLowerCase())
      )
        continue;
      const assignment = officer.assignments[0];
      matches.push({
        id: officer.id,
        forceNumber: officer.forceNumber,
        fullName: officer.fullName,
        recordStatus: officer.recordStatus,
        rank,
        originalRank: sourceText(raw["4"]),
        group,
        isRecce,
        verifiedRank: officer.rankHistories[0]?.rank.code || null,
        verifiedGroup: assignment
          ? assignment.subUnit?.code || assignment.unit.code
          : null,
      });
    }
    if (rows.length < 150) break;
    cursor = rows[rows.length - 1]!.id;
  }
  matches.sort((a, b) => compareSeniority(a, b));
  const groups = [
    { code: "ALL", label: "All workbook-linked officers", count: seen.size },
    { code: "RECCE", label: "RECCE membership", count: counts.RECCE || 0 },
    ...[...groupCodes, "OTHER", "UNSPECIFIED"].map((code) => ({
      code,
      label:
        groupLabels[code] ||
        (code === "OTHER" ? "Other disposition" : "Blank disposition"),
      count: counts[code] || 0,
    })),
  ];
  return {
    data: matches.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    ),
    groups,
    meta: {
      total: matches.length,
      page: query.page,
      pageSize: query.pageSize,
      identityMismatches,
      basis: "WORKBOOK_SOURCE",
    },
  };
}
