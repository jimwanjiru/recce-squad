import { Prisma } from "@prisma/client";
import { HttpError } from "./errors.js";
import {
  changeLabels,
  changeStatuses,
  serviceExitStatuses,
} from "./changes-fields.js";
import { businessDate } from "./history.js";
export async function applyChange(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
  expectedRevision: number,
) {
  const record = await tx.officerChange.findUnique({
    where: { id },
    include: { officer: true },
  });
  if (!record || record.deletedAt) throw new HttpError(404, "CHANGE_NOT_FOUND");
  if (record.status === "APPLIED") return record;
  if (record.status !== "SUBMITTED" || record.revision !== expectedRevision)
    throw new HttpError(409, "CHANGE_REVISION_CONFLICT");
  if (record.recordedById === userId)
    throw new HttpError(403, "CHANGE_SELF_APPROVAL_FORBIDDEN");
  const date = record.effectiveDate;
  if (!date) throw new HttpError(422, "VERIFIED_DATE_REQUIRED");
  if (date > new Date(businessDate() + "T00:00:00Z"))
    throw new HttpError(422, "FUTURE_CHANGE_NOT_DUE");
  if (record.officer.deletedAt) throw new HttpError(409, "RESTORE_BEFORE_EDIT");
  const status = changeStatuses[record.eventType];
  const exits = status && serviceExitStatuses.includes(status);
  const starts = [
    "TAKEN_ON_STRENGTH",
    "REINSTATEMENT",
    "SUB_UNIT_TRANSFER",
  ].includes(record.eventType);
  if (
    serviceExitStatuses.includes(record.officer.recordStatus) &&
    !["TAKEN_ON_STRENGTH", "REINSTATEMENT"].includes(record.eventType)
  )
    throw new HttpError(409, "OFFICER_NOT_CURRENTLY_SERVING");
  const assignments = await tx.officerAssignment.findMany({
    where: { officerId: record.officerId },
    include: { deployments: true },
    orderBy: { effectiveFrom: "desc" },
  });
  const rankHistories = await tx.officerRankHistory.findMany({
    where: { officerId: record.officerId },
    orderBy: { effectiveFrom: "desc" },
  });
  const statuses = await tx.officerStatusHistory.findMany({
    where: { officerId: record.officerId },
    orderBy: { effectiveFrom: "desc" },
  });
  // Refuse to splice an unreviewed backdated event through a later verified timeline.
  for (const records of [
    ...(exits || starts ? [assignments] : []),
    ...(status ? [statuses] : []),
    ...(record.eventType === "REVERSION" ? [rankHistories] : []),
  ])
    if (records.some((h) => h.effectiveFrom >= date))
      throw new HttpError(409, "BACKDATED_OR_SAME_DAY_CHANGE_REQUIRES_REVIEW");
  const previousAssignment = assignments.find(
      (a) => !a.effectiveTo && a.isPrimary,
    ),
    previousRank = rankHistories.find((r) => !r.effectiveTo);
  let targetUnit = record.targetUnitId
    ? await tx.unit.findUnique({ where: { id: record.targetUnitId } })
    : null;
  let targetSub = record.targetSubUnitId
    ? await tx.subUnit.findUnique({ where: { id: record.targetSubUnitId } })
    : null;
  if (
    starts &&
    (!targetUnit?.isActive ||
      (record.targetSubUnitId &&
        (!targetSub?.isActive || targetSub.unitId !== targetUnit.id)))
  )
    throw new HttpError(422, "INVALID_PARENT_UNIT");
  if (record.eventType === "REVERSION") {
    const rank = record.targetRankId
      ? await tx.rank.findUnique({ where: { id: record.targetRankId } })
      : null;
    if (!rank?.isActive)
      throw new HttpError(422, "CHANGE_TARGET_RANK_REQUIRED");
  }
  const movementType = await tx.movementType.upsert({
    where: { code: record.eventType },
    create: { code: record.eventType, name: changeLabels[record.eventType]! },
    update: {},
  });
  const movement = await tx.personnelMovement.create({
    data: {
      officerId: record.officerId,
      movementTypeId: movementType.id,
      effectiveDate: date,
      fromAssignmentId: previousAssignment?.id,
      fromRankId: previousRank?.rankId,
      toRankId: record.eventType === "REVERSION" ? record.targetRankId : null,
      recordedById: record.recordedById,
      approvedById: userId,
      approvedAt: new Date(),
      approvalStatus: "APPROVED",
      appliedAt: new Date(),
      datesVerifiedAt: new Date(),
      datesVerifiedById: userId,
      idempotencyKey: "officer-change:" + record.id,
    },
  });
  for (const closingAssignment of exits
    ? assignments.filter((a) => !a.effectiveTo)
    : starts && previousAssignment
      ? [previousAssignment]
      : []) {
    for (const deployment of closingAssignment.deployments.filter(
      (d) => !d.effectiveTo || d.effectiveTo > date,
    )) {
      if (deployment.effectiveFrom >= date)
        throw new HttpError(
          409,
          "BACKDATED_OR_SAME_DAY_CHANGE_REQUIRES_REVIEW",
        );
      await tx.deploymentRecord.update({
        where: { id: deployment.id },
        data: {
          effectiveTo: date,
          datesVerifiedAt: new Date(),
          datesVerifiedById: userId,
        },
      });
    }
    await tx.officerAssignment.update({
      where: { id: closingAssignment.id },
      data: { effectiveTo: date },
    });
  }
  if (starts) {
    const assignment = await tx.officerAssignment.create({
      data: {
        officerId: record.officerId,
        unitId: targetUnit!.id,
        subUnitId: targetSub?.id,
        disposition:
          targetSub?.code ||
          (["RECCE", "R"].includes(targetUnit!.code.toUpperCase())
            ? "NA"
            : targetUnit!.code),
        effectiveFrom: date,
        datesVerifiedAt: new Date(),
        datesVerifiedById: userId,
      },
    });
    await tx.personnelMovement.update({
      where: { id: movement.id },
      data: { toAssignmentId: assignment.id },
    });
  }
  if (record.eventType === "REVERSION") {
    if (previousRank)
      await tx.officerRankHistory.update({
        where: { id: previousRank.id },
        data: { effectiveTo: date },
      });
    await tx.officerRankHistory.create({
      data: {
        officerId: record.officerId,
        rankId: record.targetRankId!,
        effectiveFrom: date,
        datesVerifiedAt: new Date(),
        datesVerifiedById: userId,
      },
    });
  }
  if (status) {
    const current = statuses.find((h) => !h.effectiveTo);
    if (current)
      await tx.officerStatusHistory.update({
        where: { id: current.id },
        data: { effectiveTo: date },
      });
    await tx.officerStatusHistory.create({
      data: {
        officerId: record.officerId,
        status,
        effectiveFrom: date,
        movementId: movement.id,
        datesVerifiedAt: new Date(),
        datesVerifiedById: userId,
      },
    });
  }
  await tx.officer.update({
    where: { id: record.officerId },
    data: {
      ...(status ? { recordStatus: status } : {}),
      version: { increment: 1 },
    },
  });
  const result = await tx.officerChange.update({
    where: { id: record.id },
    data: {
      status: "APPLIED",
      revision: { increment: 1 },
      approvedById: userId,
      approvedAt: new Date(),
      appliedAt: new Date(),
      movementId: movement.id,
    },
  });
  await tx.auditLog.create({
    data: {
      userId,
      action: "OFFICER_CHANGE_APPLIED",
      entityType: "OfficerChange",
      entityId: record.id,
      changedFields: ["status", "effectiveDate", "officerHistories"],
    },
  });
  return result;
}
