import { Prisma } from "@prisma/client";
import { overallRank } from "./ranks.js";
import {
  checkSourceOfficer,
  openSource,
  sourceText,
} from "./workbook-source.js";

// Called inside the authorized import transaction. No historical dates or statuses are fabricated.
export async function seedOfficerRanks(
  tx: Prisma.TransactionClient,
  batchId: string,
  actorId: string,
) {
  const rows = await tx.importRow.findMany({
    where: { batchId, sheetName: "NAMES", rowNumber: { gt: 1 } },
    select: {
      id: true,
      rawData: true,
      rowNumber: true,
      officerId: true,
      batch: { select: { fileSha256: true, status: true } },
      officer: { select: { id: true, forceNumber: true, fullName: true } },
    },
  });
  const counts = { created: 0, preserved: 0, held: 0, unmapped: 0 };
  for (const row of rows) {
    if (!row.officer || row.batch.status === "ROLLED_BACK") {
      counts.held++;
      continue;
    }
    const existing = await tx.officerRankSnapshot.findUnique({
      where: { officerId: row.officer.id },
    });
    if (existing) {
      counts.preserved++;
      continue;
    }
    const raw = await openSource(
      row.rawData,
      `${row.batch.fileSha256}:NAMES:${row.rowNumber}`,
    );
    try {
      checkSourceOfficer(raw, row.officer);
    } catch {
      counts.held++;
      continue;
    }
    const rankCode = overallRank(raw["5"]);
    if (rankCode === "UNKNOWN") counts.unmapped++;
    await tx.officerRankSnapshot.create({
      data: {
        officerId: row.officer.id,
        sourceRowId: row.id,
        rank1: sourceText(raw["4"]),
        rank2: sourceText(raw["5"]),
        rankCode,
        seededById: actorId,
      },
    });
    counts.created++;
  }
  return counts;
}
