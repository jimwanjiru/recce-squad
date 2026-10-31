import { currentPersonnel } from "./personnel-records.js";
import { PrismaClient } from "@prisma/client";
import { groupCodes, groupLabels, sourceRank } from "./dashboard.js";
import { sourceText } from "./workbook-source.js";
import { compareSeniority } from "./seniority.js";
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
  db: Pick<PrismaClient, "officer">,
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
  const identityMismatches = 0;
  for (const { officer, raw } of await currentPersonnel(db)) {
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
  matches.sort((a, b) => compareSeniority(a, b));
  const groups = [
    { code: "ALL", label: "All officers", count: seen.size },
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
      basis: "DATABASE",
    },
  };
}
