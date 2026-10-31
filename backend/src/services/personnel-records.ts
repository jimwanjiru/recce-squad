import { PrismaClient } from "@prisma/client";
import { serviceExitStatuses } from "./changes-fields.js";
import { businessDate } from "./history.js";
// Database facts and transactional histories are the operational source of truth.
export async function currentPersonnel(db: Pick<PrismaClient, "officer">) {
  const today = new Date(businessDate() + "T00:00:00Z");
  const effective = {
    effectiveFrom: { lte: today },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }],
  };
  const officers = await db.officer.findMany({
    where: { deletedAt: null, recordStatus: { notIn: serviceExitStatuses } },
    include: {
      personnelData: true,
      rankSnapshot: true,
      rankHistories: { where: effective, include: { rank: true }, take: 1 },
      assignments: {
        where: { ...effective, isPrimary: true },
        include: { unit: true, subUnit: true },
        take: 1,
      },
    },
  });
  return officers.map((officer) => {
    const details = (officer.personnelData?.details || {}) as Record<
      string,
      string
    >;
    const assignment = officer.assignments[0],
      rank = officer.rankHistories[0];
    return {
      officer,
      raw: {
        ...details,
        4:
          rank?.originalRankSpelling ||
          rank?.rank.code ||
          officer.rankSnapshot?.rank1 ||
          details["4"] ||
          "",
        5:
          rank?.rank.code ||
          officer.rankSnapshot?.rankCode ||
          details["5"] ||
          "",
        20: assignment
          ? assignment.subUnit?.code ||
            assignment.disposition ||
            assignment.unit.code
          : details["20"] || "",
        22: assignment
          ? ["R", "RECCE"].includes(assignment.unit.code.toUpperCase())
            ? "R"
            : ""
          : details["22"] || "",
      },
    };
  });
}
