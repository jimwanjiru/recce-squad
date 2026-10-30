import "dotenv/config";
import { parseArgs } from "node:util";
import { createDatabase } from "../backend/src/config/database.js";
import { organizationLock } from "../backend/src/services/organization-lock.js";
async function main() {
  const { values } = parseArgs({
    options: {
      batch: { type: "string" },
      actor: { type: "string", default: "admin@recce.local" },
      "backup-confirmed": { type: "boolean" },
    },
  });
  if (!values.batch || !values["backup-confirmed"])
    throw new Error("BATCH_AND_BACKUP_CONFIRMATION_REQUIRED");
  const url = new URL(process.env.DATABASE_URL || "");
  if (
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("LOCAL_DATABASE_REQUIRED");
  const db = createDatabase();
  try {
    const result = await db.$transaction(
      async (tx) => {
        await organizationLock(tx);
        const actor = await tx.user.findUnique({
          where: { email: values.actor },
          include: {
            roles: {
              include: {
                role: {
                  include: { permissions: { include: { permission: true } } },
                },
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
          !grants.has("imports.commit") ||
          !grants.has("officers.archive")
        )
          throw new Error("ROLLBACK_ACTOR_NOT_AUTHORIZED");
        const batch = await tx.importBatch.findUnique({
          where: { id: values.batch },
          include: { rows: true },
        });
        if (!batch) throw new Error("IMPORT_BATCH_NOT_FOUND");
        if (batch.status === "ROLLED_BACK") return { alreadyRolledBack: true };
        if (batch.status !== "CORE_IMPORTED_REVIEW_PENDING")
          throw new Error("BATCH_NOT_ELIGIBLE_FOR_ROLLBACK");
        if (batch.rows.some((r) => r.verificationStatus !== "UNVERIFIED"))
          throw new Error("REVIEWED_RECORDS_REQUIRE_MANUAL_ROLLBACK");
        const ids = batch.rows.flatMap((r) =>
          r.officerId ? [r.officerId] : [],
        );
        const officers = await tx.officer.findMany({
          where: { id: { in: ids } },
          include: {
            _count: {
              select: {
                assignments: true,
                rankHistories: true,
                statusHistories: true,
                movements: true,
                changes: true,
                courses: true,
                awards: true,
                disciplinaryRecords: true,
                examinations: true,
                importRows: true,
              },
            },
            financialDetail: true,
            serviceProfile: true,
            rankSnapshot: true,
          },
        });
        if (
          officers.length !== ids.length ||
          officers.some(
            (o) =>
              o.version !== 0 ||
              +o.createdAt !== +o.updatedAt ||
              o.deletedAt ||
              o.serviceProfile ||
              o.financialDetail ||
              (o.rankSnapshot &&
                !batch.rows.some(
                  (r) => r.id === o.rankSnapshot!.sourceRowId,
                )) ||
              o._count.importRows !== 1 ||
              Object.entries(o._count).some(
                ([k, n]) => k !== "importRows" && n > 0,
              ),
          )
        )
          throw new Error("MODIFIED_OFFICERS_REQUIRE_MANUAL_ROLLBACK");
        await tx.officerRankSnapshot.deleteMany({
          where: { sourceRow: { batchId: batch.id } },
        });
        await tx.importRow.updateMany({
          where: { batchId: batch.id },
          data: { officerId: null, status: "ROLLED_BACK" },
        });
        await tx.officerEducation.deleteMany({
          where: { officerId: { in: ids } },
        });
        await tx.officer.deleteMany({ where: { id: { in: ids } } });
        await tx.importBatch.update({
          where: { id: batch.id },
          data: { status: "ROLLED_BACK", importedRows: 0 },
        });
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: "WORKBOOK_IMPORT_ROLLED_BACK",
            entityType: "ImportBatch",
            entityId: batch.id,
            changedFields: ["importedOfficers", "sourceLinks"],
          },
        });
        return {
          rolledBackOfficers: ids.length,
          encryptedSourceRetained: true,
        };
      },
      { timeout: 180000, maxWait: 15000 },
    );
    console.log(JSON.stringify(result));
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    "Workbook rollback failed:",
    /^[A-Z][A-Z0-9_]+$/.test(error?.message || "")
      ? error.message
      : "CHECK_DATABASE_AND_BATCH_STATE",
  );
  process.exitCode = 1;
});
