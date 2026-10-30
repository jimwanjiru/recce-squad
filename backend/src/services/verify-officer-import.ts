import { Prisma } from "@prisma/client";
import { organizationLock } from "./organization-lock.js";
import { checkSourceOfficer, openSource } from "./workbook-source.js";
import { HttpError } from "./errors.js";

export async function verifyOfficerImport(
  tx: Prisma.TransactionClient,
  batchId: string,
  actorId: string,
  commit: boolean,
) {
  await organizationLock(tx);
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    include: {
      roles: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });
  const grants = new Set(
    actor?.roles.flatMap((r) =>
      r.role.permissions.map((p) => p.permission.code),
    ) || [],
  );
  if (
    !actor?.isActive ||
    [
      "imports.commit",
      "officers.update",
      "fields.import_source.view",
      "fields.rank_history.view",
    ].some((p) => !grants.has(p))
  )
    throw new HttpError(403, "OFFICER_VERIFICATION_NOT_AUTHORIZED");
  const batch = await tx.importBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.status === "ROLLED_BACK")
    throw new HttpError(404, "IMPORT_BATCH_NOT_FOUND");
  const rows = await tx.importRow.findMany({
    where: { batchId, sheetName: "NAMES", officerId: { not: null } },
    orderBy: { officerId: "asc" },
    select: {
      id: true,
      officerId: true,
      rawData: true,
      rowNumber: true,
      validationErrors: true,
    },
  });
  const ids = rows.map((r) => r.officerId!);
  if (!ids.length) throw new HttpError(409, "NO_IMPORTED_OFFICERS_TO_VERIFY");
  if (new Set(ids).size !== ids.length)
    throw new HttpError(409, "IMPORT_IDENTITY_REQUIRES_REVIEW");
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM Officer WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`,
  );
  const officers = await tx.officer.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      forceNumber: true,
      verificationStatus: true,
      rankSnapshot: { select: { sourceRowId: true } },
    },
  });
  const identities = new Map(officers.map((o) => [o.id, o]));
  let fieldWarnings = 0;
  for (const row of rows) {
    const officer = identities.get(row.officerId!);
    if (!officer || officer.rankSnapshot?.sourceRowId !== row.id)
      throw new HttpError(409, "SEED_OFFICER_RANKS_BEFORE_VERIFICATION");
    const raw = await openSource(
      row.rawData,
      `${batch.fileSha256}:NAMES:${row.rowNumber}`,
    );
    checkSourceOfficer(raw, officer);
    if (
      Array.isArray(row.validationErrors) &&
      row.validationErrors.some(
        (e) =>
          e !== "HISTORIES_AND_UNMAPPED_FIELDS_REQUIRE_REVIEW" &&
          e !== "EXISTING_FORCE_NUMBER_NOT_OVERWRITTEN",
      )
    )
      fieldWarnings++;
  }
  const pending = officers
    .filter((o) => o.verificationStatus !== "VERIFIED")
    .map((o) => o.id);
  if (commit && pending.length) {
    const now = new Date();
    for (let i = 0; i < pending.length; i += 100) {
      const chunk = pending.slice(i, i + 100);
      await tx.officer.updateMany({
        where: { id: { in: chunk } },
        data: {
          verificationStatus: "VERIFIED",
          verifiedAt: now,
          verifiedById: actorId,
          version: { increment: 1 },
        },
      });
      await tx.auditLog.createMany({
        data: chunk.map((id) => ({
          userId: actorId,
          action: "OFFICER_DATA_VERIFIED",
          entityType: "Officer",
          entityId: id,
          changedFields: ["verificationStatus", "verifiedAt", "verifiedById"],
        })),
      });
    }
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: "IMPORTED_OFFICER_DATA_VERIFIED",
        entityType: "ImportBatch",
        entityId: batchId,
        changedFields: ["officerDataVerification"],
      },
    });
  }
  return {
    officers: ids.length,
    verified: commit ? pending.length : 0,
    alreadyVerified: officers.length - pending.length,
    awaitingVerification: commit ? 0 : pending.length,
    rowsWithFieldWarnings: fieldWarnings,
  };
}
