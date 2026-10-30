import { Router, Request, Response, NextFunction } from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { organizationLock } from "../services/organization-lock.js";
import {
  sortRankReferences,
  currentRankReferences,
} from "../services/ranks.js";
import { HttpError } from "../services/errors.js";
import {
  officerTransaction,
  verifiedDate,
  assertNoOverlap,
} from "../services/history.js";
const run =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
const who = (res: Response) =>
  res.locals.identity as { userId: string; grants: Set<string> };
function need(res: Response, ...permissions: string[]) {
  if (permissions.some((p) => !who(res).grants.has(p)))
    throw new HttpError(403, "PERMISSION_DENIED");
}
const text = z.string().trim().min(1).max(191),
  code = z.string().trim().min(1).max(64);
const date = z
  .string()
  .refine((value) => {
    try {
      verifiedDate(value);
      return true;
    } catch {
      return false;
    }
  }, "Complete verified date required")
  .transform(verifiedDate);
const interval = {
  effectiveFrom: date,
  effectiveTo: date.nullable().optional(),
  datesVerified: z.literal(true),
};
function validInterval(from: Date, to?: Date | null) {
  if (to && to <= from) throw new HttpError(422, "INVALID_INTERVAL");
}
function windowWhere(from: Date, to?: Date | null) {
  return {
    ...(to ? { effectiveFrom: { lt: to } } : {}),
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }],
  };
}
const listing = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    q: z.string().max(100).optional(),
    active: z.enum(["all", "true", "false"]).default("all"),
    asOf: date.optional(),
    unitId: text.optional(),
  })
  .strict();
const pageArgs = (q: z.infer<typeof listing>) => ({
  skip: (q.page - 1) * q.pageSize,
  take: q.pageSize,
});
const asOf = (q: z.infer<typeof listing>) =>
  q.asOf
    ? {
        effectiveFrom: { lte: q.asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: q.asOf } }],
      }
    : {};
const stamp = (res: Response) => ({
  datesVerifiedAt: new Date(),
  datesVerifiedById: who(res).userId,
});
async function audit(
  tx: Prisma.TransactionClient,
  res: Response,
  action: string,
  type: string,
  id: string,
  fields: string[],
) {
  await tx.auditLog.create({
    data: {
      userId: who(res).userId,
      action,
      entityType: type,
      entityId: id,
      changedFields: fields,
    },
  });
}
async function scope(
  tx: Prisma.TransactionClient,
  unitId: string,
  subUnitId?: string | null,
) {
  if (!(await tx.unit.findFirst({ where: { id: unitId, isActive: true } })))
    throw new HttpError(422, "INVALID_UNIT");
  if (
    subUnitId &&
    !(await tx.subUnit.findFirst({
      where: { id: subUnitId, unitId, isActive: true },
    }))
  )
    throw new HttpError(422, "INVALID_SUB_UNIT");
}
async function noCodeCollision(
  tx: Prisma.TransactionClient,
  value: string,
  rankId?: string,
) {
  const alias = await tx.rankAlias.findUnique({ where: { alias: value } });
  if (alias && alias.rankId !== rankId)
    throw new HttpError(409, "RANK_ALIAS_CONFLICT");
  const rank = await tx.rank.findUnique({ where: { code: value } });
  if (rank && rank.id !== rankId) throw new HttpError(409, "DUPLICATE_RECORD");
}
export function organizationRoutes(db: PrismaClient) {
  const router = Router();
  router.get(
    "/organization/options",
    run(async (_req, res) => {
      need(res, "organization.view");
      const [ranks, units, subUnits] = await Promise.all([
        db.rank.findMany({
          where: { isActive: true },
          select: { id: true, name: true, code: true },
          orderBy: { hierarchyLevel: "asc" },
        }),
        db.unit.findMany({
          where: { isActive: true },
          select: { id: true, name: true, code: true, parentUnitId: true },
          orderBy: { name: "asc" },
        }),
        db.subUnit.findMany({
          where: { isActive: true },
          select: { id: true, name: true, code: true, unitId: true },
          orderBy: { name: "asc" },
        }),
      ]);
      res.json({
        data: { ranks: currentRankReferences(ranks), units, subUnits },
      });
    }),
  );

  for (const kind of ["ranks", "units", "sub-units"] as const)
    router.get(
      "/" + kind,
      run(async (req, res) => {
        need(res, "organization.view");
        const q = listing.parse(req.query);
        const where = {
          ...(q.active === "all" ? {} : { isActive: q.active === "true" }),
          ...(q.q
            ? { OR: [{ name: { contains: q.q } }, { code: { contains: q.q } }] }
            : {}),
        };
        let data: unknown, total: number;
        if (kind === "ranks") {
          const ranks = sortRankReferences(
            await db.rank.findMany({ where, include: { aliases: true } }),
          );
          total = ranks.length;
          data = ranks.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
        } else if (kind === "units") {
          [data, total] = await db.$transaction([
            db.unit.findMany({
              ...pageArgs(q),
              where,
              include: {
                parentUnit: { select: { id: true, name: true, code: true } },
              },
              orderBy: { id: "asc" },
            }),
            db.unit.count({ where }),
          ]);
        } else {
          const subWhere = {
            ...where,
            ...(q.unitId ? { unitId: q.unitId } : {}),
          };
          [data, total] = await db.$transaction([
            db.subUnit.findMany({
              ...pageArgs(q),
              where: subWhere,
              include: {
                unit: { select: { id: true, name: true, code: true } },
              },
              orderBy: { id: "asc" },
            }),
            db.subUnit.count({ where: subWhere }),
          ]);
        }
        res.json({ data, meta: { total, page: q.page, pageSize: q.pageSize } });
      }),
    );
  router.post(
    "/ranks",
    run(async (req, res) => {
      need(res, "ranks.manage");
      const data = z
        .object({
          code,
          name: text,
          hierarchyLevel: z.number().int().min(0).max(10000),
        })
        .strict()
        .parse(req.body);
      const result = await db.$transaction(async (tx) => {
        await organizationLock(tx);
        await noCodeCollision(tx, data.code);
        const rank = await tx.rank.create({ data });
        await audit(
          tx,
          res,
          "RANK_CREATED",
          "Rank",
          rank.id,
          Object.keys(data),
        );
        return rank;
      });
      res.status(201).json({ data: result });
    }),
  );
  router.patch(
    "/ranks/:id",
    run(async (req, res) => {
      need(res, "ranks.manage");
      const { expectedUpdatedAt, ...data } = z
        .object({
          expectedUpdatedAt: z.string().datetime(),
          code: code.optional(),
          name: text.optional(),
          hierarchyLevel: z.number().int().min(0).max(10000).optional(),
          isActive: z.boolean().optional(),
        })
        .strict()
        .parse(req.body);
      const id = z.string().parse(req.params.id);
      const result = await db.$transaction(async (tx) => {
        await organizationLock(tx);
        const old = await tx.rank.findUnique({ where: { id } });
        if (!old) throw new HttpError(404, "NOT_FOUND");
        if (old.updatedAt.toISOString() !== expectedUpdatedAt)
          throw new HttpError(409, "RECORD_CHANGED");
        if (data.code && data.code !== old.code)
          await noCodeCollision(tx, data.code, id);
        if (
          (data.code && data.code !== old.code) ||
          (data.hierarchyLevel !== undefined &&
            data.hierarchyLevel !== old.hierarchyLevel)
        ) {
          if (
            (await tx.officerRankHistory.count({ where: { rankId: id } })) ||
            (await tx.rankEstablishment.count({ where: { rankId: id } })) ||
            (await tx.personnelMovement.count({
              where: { OR: [{ fromRankId: id }, { toRankId: id }] },
            })) ||
            (await tx.retirementRule.count({ where: { rankId: id } }))
          )
            throw new HttpError(409, "REFERENCED_TAXONOMY_IMMUTABLE");
        }
        const rank = await tx.rank.update({
          where: { id },
          data: {
            ...data,
            updatedAt: new Date(
              Math.max(Date.now(), old.updatedAt.getTime() + 1),
            ),
          },
        });
        await audit(tx, res, "RANK_UPDATED", "Rank", id, Object.keys(data));
        return rank;
      });
      res.json({ data: result });
    }),
  );
  router.post(
    "/ranks/:id/aliases",
    run(async (req, res) => {
      need(res, "ranks.manage");
      const { alias } = z.object({ alias: text }).strict().parse(req.body);
      const id = z.string().parse(req.params.id);
      const result = await db.$transaction(async (tx) => {
        await organizationLock(tx);
        if (!(await tx.rank.findFirst({ where: { id, isActive: true } })))
          throw new HttpError(422, "INVALID_RANK");
        await noCodeCollision(tx, alias, id);
        const value = await tx.rankAlias.create({
          data: { rankId: id, alias },
        });
        await audit(tx, res, "RANK_ALIAS_CREATED", "Rank", id, ["alias"]);
        return value;
      });
      res.status(201).json({ data: result });
    }),
  );
  router.post(
    "/units",
    run(async (req, res) => {
      need(res, "units.manage");
      const data = z
        .object({ code, name: text, parentUnitId: text.nullable().optional() })
        .strict()
        .parse(req.body);
      const result = await db.$transaction(async (tx) => {
        await organizationLock(tx);
        if (
          data.parentUnitId &&
          !(await tx.unit.findFirst({
            where: { id: data.parentUnitId, isActive: true },
          }))
        )
          throw new HttpError(422, "INVALID_PARENT_UNIT");
        const unit = await tx.unit.create({ data });
        await audit(
          tx,
          res,
          "UNIT_CREATED",
          "Unit",
          unit.id,
          Object.keys(data),
        );
        return unit;
      });
      res.status(201).json({ data: result });
    }),
  );
  router.patch(
    "/units/:id",
    run(async (req, res) => {
      need(res, "units.manage");
      const id = z.string().parse(req.params.id);
      const {
        expectedParentUnitId,
        expectedName,
        expectedCode,
        expectedIsActive,
        ...data
      } = z
        .object({
          expectedParentUnitId: text.nullable(),
          expectedName: text,
          expectedCode: code,
          expectedIsActive: z.boolean(),
          name: text.optional(),
          code: code.optional(),
          parentUnitId: text.nullable().optional(),
          isActive: z.boolean().optional(),
        })
        .strict()
        .parse(req.body);
      const result = await db.$transaction(async (tx) => {
        await organizationLock(tx);
        const old = await tx.unit.findUnique({ where: { id } });
        if (!old) throw new HttpError(404, "NOT_FOUND");
        if (
          old.parentUnitId !== expectedParentUnitId ||
          old.name !== expectedName ||
          old.code !== expectedCode ||
          old.isActive !== expectedIsActive
        )
          throw new HttpError(409, "RECORD_CHANGED");
        if (
          data.code &&
          data.code !== old.code &&
          ((await tx.officerAssignment.count({ where: { unitId: id } })) ||
            (await tx.rankEstablishment.count({ where: { unitId: id } })))
        )
          throw new HttpError(409, "REFERENCED_TAXONOMY_IMMUTABLE");
        if (
          data.parentUnitId !== undefined &&
          data.parentUnitId !== old.parentUnitId
        ) {
          if (
            (await tx.officerAssignment.count({ where: { unitId: id } })) ||
            (await tx.rankEstablishment.count({ where: { unitId: id } })) ||
            (await tx.unit.count({ where: { parentUnitId: id } })) ||
            (await tx.subUnit.count({ where: { unitId: id } }))
          )
            throw new HttpError(409, "REFERENCED_HIERARCHY_IMMUTABLE");
          const seen = new Set([id]);
          let parent = data.parentUnitId;
          while (parent) {
            if (seen.has(parent)) throw new HttpError(422, "UNIT_CYCLE");
            seen.add(parent);
            const p = await tx.unit.findUnique({ where: { id: parent } });
            if (!p || !p.isActive)
              throw new HttpError(422, "INVALID_PARENT_UNIT");
            parent = p.parentUnitId;
          }
        }
        if (
          data.isActive === false &&
          ((await tx.unit.count({
            where: { parentUnitId: id, isActive: true },
          })) ||
            (await tx.subUnit.count({ where: { unitId: id, isActive: true } })))
        )
          throw new HttpError(409, "ACTIVE_CHILDREN_EXIST");
        if (
          data.isActive === true &&
          (data.parentUnitId === undefined
            ? old.parentUnitId
            : data.parentUnitId) &&
          !(await tx.unit.findFirst({
            where: {
              id: (data.parentUnitId === undefined
                ? old.parentUnitId
                : data.parentUnitId)!,
              isActive: true,
            },
          }))
        )
          throw new HttpError(422, "INACTIVE_PARENT_UNIT");
        const unit = await tx.unit.update({ where: { id }, data });
        await audit(tx, res, "UNIT_UPDATED", "Unit", id, Object.keys(data));
        return unit;
      });
      res.json({ data: result });
    }),
  );
  router.post(
    "/sub-units",
    run(async (req, res) => {
      need(res, "sub_units.manage");
      const data = z
        .object({ unitId: text, code, name: text })
        .strict()
        .parse(req.body);
      const result = await db.$transaction(async (tx) => {
        await organizationLock(tx);
        await scope(tx, data.unitId);
        const sub = await tx.subUnit.create({ data });
        await audit(
          tx,
          res,
          "SUB_UNIT_CREATED",
          "SubUnit",
          sub.id,
          Object.keys(data),
        );
        return sub;
      });
      res.status(201).json({ data: result });
    }),
  );
  router.patch(
    "/sub-units/:id",
    run(async (req, res) => {
      need(res, "sub_units.manage");
      const id = z.string().parse(req.params.id);
      const { expectedCode, expectedName, expectedIsActive, ...data } = z
        .object({
          expectedCode: code,
          expectedName: text,
          expectedIsActive: z.boolean(),
          code: code.optional(),
          name: text.optional(),
          isActive: z.boolean().optional(),
        })
        .strict()
        .parse(req.body);
      const result = await db.$transaction(async (tx) => {
        await organizationLock(tx);
        const old = await tx.subUnit.findUnique({ where: { id } });
        if (!old) throw new HttpError(404, "NOT_FOUND");
        if (
          old.code !== expectedCode ||
          old.name !== expectedName ||
          old.isActive !== expectedIsActive
        )
          throw new HttpError(409, "RECORD_CHANGED");
        if (
          data.code &&
          data.code !== old.code &&
          ((await tx.officerAssignment.count({ where: { subUnitId: id } })) ||
            (await tx.rankEstablishment.count({ where: { subUnitId: id } })))
        )
          throw new HttpError(409, "REFERENCED_TAXONOMY_IMMUTABLE");
        if (data.isActive === true) await scope(tx, old.unitId);
        const sub = await tx.subUnit.update({ where: { id }, data });
        await audit(
          tx,
          res,
          "SUB_UNIT_UPDATED",
          "SubUnit",
          id,
          Object.keys(data),
        );
        return sub;
      });
      res.json({ data: result });
    }),
  );
  router.get(
    "/assignments",
    run(async (req, res) => {
      need(res, "officers.view", "fields.assignments.view");
      const q = listing.parse(req.query);
      const where = {
        ...(q.unitId ? { unitId: q.unitId } : {}),
        ...asOf(q),
        ...(q.q
          ? {
              officer: {
                OR: [
                  { forceNumber: { contains: q.q } },
                  { fullName: { contains: q.q } },
                ],
              },
            }
          : {}),
      };
      const [data, total] = await db.$transaction([
        db.officerAssignment.findMany({
          ...pageArgs(q),
          where,
          include: {
            officer: {
              select: {
                id: true,
                forceNumber: true,
                fullName: true,
                deletedAt: true,
              },
            },
            unit: { select: { id: true, name: true, code: true } },
            subUnit: { select: { id: true, name: true, code: true } },
          },
          orderBy: [{ effectiveFrom: "desc" }, { id: "asc" }],
        }),
        db.officerAssignment.count({ where }),
      ]);
      res.json({ data, meta: { total, page: q.page, pageSize: q.pageSize } });
    }),
  );
  router.post(
    "/assignments",
    run(async (req, res) => {
      need(res, "assignments.baseline.manage", "fields.assignments.write");
      const { officerId, datesVerified, ...data } = z
        .object({
          officerId: text,
          unitId: text,
          subUnitId: text.nullable().optional(),
          dutyTitle: z.string().max(191).nullable().optional(),
          disposition: z.string().max(191).nullable().optional(),
          remarks: z.string().max(5000).nullable().optional(),
          ...interval,
        })
        .strict()
        .parse(req.body);
      validInterval(data.effectiveFrom, data.effectiveTo);
      const result = await officerTransaction(db, officerId, async (tx) => {
        await organizationLock(tx);
        const officer = await tx.officer.findUniqueOrThrow({
          where: { id: officerId },
        });
        if (officer.deletedAt) throw new HttpError(409, "RESTORE_BEFORE_EDIT");
        await scope(tx, data.unitId, data.subUnitId);
        if (
          (await tx.officerAssignment.count({ where: { officerId } })) ||
          (await tx.personnelMovement.count({ where: { officerId } }))
        )
          throw new HttpError(409, "MOVEMENT_WORKFLOW_REQUIRED");
        await assertNoOverlap(tx, "assignment", officerId, {
          effectiveFrom: data.effectiveFrom,
          effectiveTo: data.effectiveTo ?? null,
        });
        const assignment = await tx.officerAssignment.create({
          data: { ...data, officerId, ...stamp(res) },
        });
        await audit(
          tx,
          res,
          "ASSIGNMENT_BASELINE_CREATED",
          "OfficerAssignment",
          assignment.id,
          Object.keys(data),
        );
        return assignment;
      });
      res.status(201).json({ data: result });
    }),
  );
  router.get(
    "/deployments",
    run(async (req, res) => {
      need(
        res,
        "officers.view",
        "fields.assignments.view",
        "fields.deployment_records.view",
      );
      const q = listing.parse(req.query);
      const where = {
        ...asOf(q),
        ...(q.unitId ? { assignment: { unitId: q.unitId } } : {}),
        ...(q.q
          ? {
              assignment: {
                ...(q.unitId ? { unitId: q.unitId } : {}),
                officer: {
                  OR: [
                    { forceNumber: { contains: q.q } },
                    { fullName: { contains: q.q } },
                  ],
                },
              },
            }
          : {}),
      };
      const [data, total] = await db.$transaction([
        db.deploymentRecord.findMany({
          ...pageArgs(q),
          where,
          include: {
            assignment: {
              select: {
                id: true,
                officer: {
                  select: { id: true, forceNumber: true, fullName: true },
                },
                unit: { select: { id: true, name: true, code: true } },
                subUnit: { select: { id: true, name: true, code: true } },
              },
            },
          },
          orderBy: [{ effectiveFrom: "desc" }, { id: "asc" }],
        }),
        db.deploymentRecord.count({ where }),
      ]);
      res.json({ data, meta: { total, page: q.page, pageSize: q.pageSize } });
    }),
  );
  router.post(
    "/deployments",
    run(async (req, res) => {
      need(res, "fields.deployment_records.write");
      const { datesVerified, ...data } = z
        .object({
          assignmentId: text,
          deploymentStatus: text,
          locationLabel: text.nullable().optional(),
          remarks: z.string().max(5000).nullable().optional(),
          ...interval,
        })
        .strict()
        .parse(req.body);
      validInterval(data.effectiveFrom, data.effectiveTo);
      const assignment = await db.officerAssignment.findUnique({
        where: { id: data.assignmentId },
      });
      if (!assignment) throw new HttpError(422, "INVALID_ASSIGNMENT");
      const result = await officerTransaction(
        db,
        assignment.officerId,
        async (tx) => {
          const current = await tx.officerAssignment.findUniqueOrThrow({
            where: { id: assignment.id },
            include: { officer: true },
          });
          if (current.officer.deletedAt)
            throw new HttpError(409, "RESTORE_BEFORE_EDIT");
          if (
            data.effectiveFrom < current.effectiveFrom ||
            (current.effectiveTo &&
              (!data.effectiveTo || data.effectiveTo > current.effectiveTo))
          )
            throw new HttpError(422, "DEPLOYMENT_OUTSIDE_ASSIGNMENT");
          if (
            await tx.deploymentRecord.count({
              where: {
                assignmentId: assignment.id,
                ...windowWhere(data.effectiveFrom, data.effectiveTo),
              },
            })
          )
            throw new HttpError(409, "OVERLAPPING_HISTORY");
          const deployment = await tx.deploymentRecord.create({
            data: { ...data, ...stamp(res) },
          });
          await audit(
            tx,
            res,
            "DEPLOYMENT_RECORDED",
            "DeploymentRecord",
            deployment.id,
            Object.keys(data),
          );
          return deployment;
        },
      );
      res.status(201).json({ data: result });
    }),
  );
  router.get(
    "/establishments",
    run(async (req, res) => {
      need(res, "establishments.view");
      const q = listing.parse(req.query);
      const where = { ...asOf(q), ...(q.unitId ? { unitId: q.unitId } : {}) };
      const [data, total] = await db.$transaction([
        db.rankEstablishment.findMany({
          ...pageArgs(q),
          where,
          include: {
            rank: { select: { id: true, name: true, code: true } },
            unit: { select: { id: true, name: true, code: true } },
            subUnit: { select: { id: true, name: true, code: true } },
          },
          orderBy: [{ effectiveFrom: "desc" }, { id: "asc" }],
        }),
        db.rankEstablishment.count({ where }),
      ]);
      res.json({ data, meta: { total, page: q.page, pageSize: q.pageSize } });
    }),
  );
  router.post(
    "/establishments",
    run(async (req, res) => {
      need(res, "establishments.manage");
      const { datesVerified, approvalConfirmed, ...data } = z
        .object({
          unitId: text,
          subUnitId: text.nullable().optional(),
          rankId: text,
          authorizedStrength: z.number().int().min(0).max(1000000),
          approvalConfirmed: z.literal(true),
          ...interval,
        })
        .strict()
        .parse(req.body);
      validInterval(data.effectiveFrom, data.effectiveTo);
      const result = await db.$transaction(
        async (tx) => {
          await organizationLock(tx);
          await scope(tx, data.unitId, data.subUnitId);
          await tx.$queryRaw`SELECT id FROM Unit WHERE id=${data.unitId} FOR UPDATE`;
          if (
            !(await tx.rank.findFirst({
              where: { id: data.rankId, isActive: true },
            }))
          )
            throw new HttpError(422, "INVALID_RANK");
          if (
            await tx.rankEstablishment.count({
              where: {
                unitId: data.unitId,
                subUnitId: data.subUnitId ?? null,
                rankId: data.rankId,
                ...windowWhere(data.effectiveFrom, data.effectiveTo),
              },
            })
          )
            throw new HttpError(409, "OVERLAPPING_ESTABLISHMENT");
          const record = await tx.rankEstablishment.create({
            data: { ...data, ...stamp(res) },
          });
          await audit(
            tx,
            res,
            "APPROVED_ESTABLISHMENT_RECORDED",
            "RankEstablishment",
            record.id,
            Object.keys(data),
          );
          return record;
        },
        { isolationLevel: "ReadCommitted" },
      );
      res.status(201).json({ data: result });
    }),
  );
  for (const kind of ["deployments", "establishments"] as const)
    router.post(
      "/" + kind + "/:id/close",
      run(async (req, res) => {
        need(
          res,
          kind === "deployments"
            ? "fields.deployment_records.write"
            : "establishments.manage",
        );
        const id = z.string().parse(req.params.id);
        const { effectiveTo, expectedVerifiedAt } = z
          .object({
            effectiveTo: date,
            expectedVerifiedAt: z.string().datetime(),
            datesVerified: z.literal(true),
          })
          .strict()
          .parse(req.body);
        const execute = async (tx: Prisma.TransactionClient) => {
          const record =
            kind === "deployments"
              ? await tx.deploymentRecord.findUnique({ where: { id } })
              : await tx.rankEstablishment.findUnique({ where: { id } });
          if (!record) throw new HttpError(404, "NOT_FOUND");
          if (
            record.effectiveTo ||
            record.datesVerifiedAt.toISOString() !== expectedVerifiedAt
          )
            throw new HttpError(409, "RECORD_CHANGED");
          validInterval(record.effectiveFrom, effectiveTo);
          if (kind === "deployments") {
            const deployment = await tx.deploymentRecord.findUniqueOrThrow({
              where: { id },
              include: { assignment: true },
            });
            if (
              deployment.assignment.effectiveTo &&
              effectiveTo > deployment.assignment.effectiveTo
            )
              throw new HttpError(422, "DEPLOYMENT_OUTSIDE_ASSIGNMENT");
          }
          if (
            await (kind === "deployments"
              ? tx.deploymentRecord.update({
                  where: { id },
                  data: { effectiveTo, ...stamp(res) },
                })
              : tx.rankEstablishment.update({
                  where: { id },
                  data: { effectiveTo, ...stamp(res) },
                }))
          )
            await audit(
              tx,
              res,
              "VERIFIED_INTERVAL_CLOSED",
              kind === "deployments" ? "DeploymentRecord" : "RankEstablishment",
              id,
              ["effectiveTo"],
            );
        };
        if (kind === "deployments") {
          const record = await db.deploymentRecord.findUnique({
            where: { id },
            include: { assignment: true },
          });
          if (!record) throw new HttpError(404, "NOT_FOUND");
          await officerTransaction(db, record.assignment.officerId, execute);
        } else
          await db.$transaction(
            async (tx) => {
              await organizationLock(tx);
              const record = await tx.rankEstablishment.findUnique({
                where: { id },
              });
              if (!record) throw new HttpError(404, "NOT_FOUND");
              await tx.$queryRaw`SELECT id FROM Unit WHERE id=${record.unitId} FOR UPDATE`;
              await execute(tx);
            },
            { isolationLevel: "ReadCommitted" },
          );
        res.status(204).end();
      }),
    );
  return router;
}
