import { Prisma, PrismaClient } from "@prisma/client";
import { HttpError } from "./errors.js";
export function overlaps(
  a: { effectiveFrom: Date; effectiveTo: Date | null },
  b: { effectiveFrom: Date; effectiveTo: Date | null },
) {
  return (
    (!a.effectiveTo || b.effectiveFrom < a.effectiveTo) &&
    (!b.effectiveTo || a.effectiveFrom < b.effectiveTo)
  );
}
export function verifiedDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new HttpError(422, "VERIFIED_DATE_REQUIRED");
  const date = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new HttpError(422, "INVALID_DATE");
  return date;
}
type Interval = { effectiveFrom: Date; effectiveTo: Date | null };
export async function officerTransaction<T>(
  db: PrismaClient,
  officerId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM Officer WHERE id = ${officerId} FOR UPDATE`;
      if (!rows.length) throw new HttpError(404, "OFFICER_NOT_FOUND");
      return fn(tx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
export async function assertNoOverlap(
  tx: Prisma.TransactionClient,
  kind: "assignment" | "rank" | "status",
  officerId: string,
  interval: Interval,
  excludeId?: string,
) {
  if (interval.effectiveTo && interval.effectiveTo <= interval.effectiveFrom)
    throw new HttpError(422, "INVALID_INTERVAL");
  const where = {
    officerId,
    ...(excludeId ? { id: { not: excludeId } } : {}),
    ...(interval.effectiveTo
      ? { effectiveFrom: { lt: interval.effectiveTo } }
      : {}),
    OR: [
      { effectiveTo: null },
      { effectiveTo: { gt: interval.effectiveFrom } },
    ],
  };
  const count =
    kind === "assignment"
      ? await tx.officerAssignment.count({
          where: { ...where, isPrimary: true },
        })
      : kind === "rank"
        ? await tx.officerRankHistory.count({ where })
        : await tx.officerStatusHistory.count({ where });
  if (count) throw new HttpError(409, "OVERLAPPING_HISTORY");
}
