import { serviceExitStatuses } from "./changes-fields.js";
import { PrismaClient } from "@prisma/client";
import { groupCodes, groupLabels, sourceRank } from "./dashboard.js";
import {
  openSource,
  sourceText,
  checkSourceOfficer,
} from "./workbook-source.js";
import { compareSeniority } from "./seniority.js";
import { businessDate } from "./history.js";
import { currentPoliceRanks } from "./ranks.js";
export const rosterPermissions = [
  "organization.view",
  "officers.view",
  "fields.import_source.view",
  "fields.assignments.view",
  "fields.rank_history.view",
  "fields.service_profile.view",
];
export async function groupRoster(
  db: Pick<PrismaClient, "importRow" | "officer">,
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
    specialistDesignation: string | null;
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
        officer: {
          deletedAt: null,
          recordStatus: { notIn: serviceExitStatuses },
        },
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
              select: {
                originalRankSpelling: true,
                specialistDesignation: true,
                rank: { select: { code: true } },
              },
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
      const currentAssignment = officer.assignments[0];
      const disposition = sourceText(
        currentAssignment
          ? currentAssignment.subUnit?.code ||
              currentAssignment.disposition ||
              currentAssignment.unit.code
          : raw["20"],
      )
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
      const rank = sourceRank(officer.rankHistories[0]?.rank.code || raw["5"]);
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
        originalRank:
          officer.rankHistories[0]?.originalRankSpelling ||
          officer.rankHistories[0]?.rank.code ||
          sourceText(raw["4"]),
        specialistDesignation:
          officer.rankHistories[0]?.specialistDesignation || null,
        group,
        isRecce,
        verifiedRank: officer.rankHistories[0]?.rank.code || null,
        verifiedGroup: assignment
          ? assignment.subUnit?.code ||
            assignment.disposition ||
            assignment.unit.code
          : null,
      });
    }
    if (rows.length < 150) break;
    cursor = rows[rows.length - 1]!.id;
  }
  const verifiedOnly = await db.officer.findMany({
    where: {
      deletedAt: null,
      recordStatus: { notIn: serviceExitStatuses },
      id: { notIn: [...seen] },
      OR: [
        { assignments: { some: { ...effective, isPrimary: true } } },
        { rankHistories: { some: effective } },
      ],
    },
    select: {
      id: true,
      forceNumber: true,
      fullName: true,
      recordStatus: true,
      rankHistories: {
        where: effective,
        select: {
          originalRankSpelling: true,
          specialistDesignation: true,
          rank: { select: { code: true } },
        },
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
    seen.add(officer.id);
    const assignment = officer.assignments[0],
      rawGroup = assignment
        ? assignment.subUnit?.code ||
          assignment.disposition ||
          assignment.unit.code
        : "";
    const disposition = rawGroup.toUpperCase().replace(/\s+/g, ""),
      group = groupCodes.includes(disposition as any)
        ? disposition
        : disposition
          ? "OTHER"
          : "UNSPECIFIED";
    const isRecce =
        !!assignment &&
        ["R", "RECCE"].includes(assignment.unit.code.toUpperCase()),
      rank = sourceRank(officer.rankHistories[0]?.rank.code || "");
    counts[group] = (counts[group] || 0) + 1;
    if (isRecce) counts.RECCE = (counts.RECCE || 0) + 1;
    if (
      query.group !== "ALL" &&
      !(query.group === "RECCE" ? isRecce : query.group === group)
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
    matches.push({
      id: officer.id,
      forceNumber: officer.forceNumber,
      fullName: officer.fullName,
      rank,
      originalRank:
        officer.rankHistories[0]?.originalRankSpelling ||
        officer.rankHistories[0]?.rank.code ||
        "",
      specialistDesignation:
        officer.rankHistories[0]?.specialistDesignation || null,
      group,
      isRecce,
      recordStatus: officer.recordStatus,
      verifiedRank: officer.rankHistories[0]?.rank.code || null,
      verifiedGroup: rawGroup || null,
    });
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
    rankOrder: currentPoliceRanks,
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
