import { compareSeniority } from "../services/seniority.js";
import {
  currentPoliceRanks,
  rankPosition,
  currentRankReferences,
  officerRanks,
  OfficerRanks,
} from "../services/ranks.js";
import { Router, Request, Response, NextFunction } from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { organizationLock } from "../services/organization-lock.js";
import { HttpError } from "../services/errors.js";
import {
  fieldPermission,
  permittedOfficerSelect,
  sensitiveFields,
} from "../config/permissions.js";
import {
  createOfficer,
  updateOfficer,
  revision,
} from "../validators/officers.js";
import { officerTransaction, businessDate } from "../services/history.js";
type Identity = { userId: string; grants: Set<string> };
const actor = (res: Response) => res.locals.identity as Identity;
const run =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
const need = (res: Response, permission: string) => {
  if (!actor(res).grants.has(permission))
    throw new HttpError(403, "PERMISSION_DENIED");
};
const readSelect = (res: Response) => ({
  ...permittedOfficerSelect(actor(res).grants),
  id: true,
  forceNumber: true,
  dateEnlisted: actor(res).grants.has("fields.date_enlisted.view"),
  version: true,
  deletedAt: true,
});
async function audit(
  tx: Prisma.TransactionClient,
  res: Response,
  action: string,
  id: string,
  fields: string[],
) {
  await tx.auditLog.create({
    data: {
      userId: actor(res).userId,
      action,
      entityType: "Officer",
      entityId: id,
      changedFields: fields,
    },
  });
}
function checkWrites(res: Response, data: Record<string, unknown>) {
  for (const key of Object.keys(data)) {
    const field =
      key === "initialRank"
        ? "rankHistories"
        : key === "initialAssignment"
          ? "assignments"
          : (key as keyof typeof sensitiveFields);
    if (field in sensitiveFields) need(res, fieldPermission(field, "write"));
  }
}
function checkDates(
  data: { dateOfBirth?: Date | null; dateEnlisted?: Date | null },
  joined?: Date | null,
) {
  const today = businessDate();
  for (const date of [data.dateOfBirth, data.dateEnlisted, joined])
    if (date && date.toISOString().slice(0, 10) > today)
      throw new HttpError(422, "FUTURE_PERSONAL_DATE");
  if (
    data.dateOfBirth &&
    data.dateEnlisted &&
    data.dateOfBirth >= data.dateEnlisted
  )
    throw new HttpError(422, "ENLISTMENT_BEFORE_BIRTH");
  if (joined && data.dateEnlisted && joined < data.dateEnlisted)
    throw new HttpError(422, "UNIT_JOIN_BEFORE_ENLISTMENT");
}
async function references(
  tx: Prisma.TransactionClient,
  data: { countyId?: string | null; ethnicityId?: string | null },
) {
  if (
    data.countyId &&
    !(await tx.county.findUnique({ where: { id: data.countyId } }))
  )
    throw new HttpError(422, "INVALID_COUNTY");
  if (
    data.ethnicityId &&
    !(await tx.ethnicity.findFirst({
      where: { id: data.ethnicityId, isActive: true },
    }))
  )
    throw new HttpError(422, "INVALID_ETHNICITY");
}
const sectionConfig = {
  service: { permission: "serviceProfile", model: "officerServiceProfile" },
  assignments: { permission: "assignments", model: "officerAssignment" },
  ranks: { permission: "rankHistories", model: "officerRankHistory" },
  movements: { permission: "movements", model: "personnelMovement" },
  education: { permission: "education", model: "officerEducation" },
  courses: { permission: "courses", model: "officerCourse" },
  awards: { permission: "awards", model: "officerAward" },
  discipline: {
    permission: "disciplinaryRecords",
    model: "officerDisciplinaryRecord",
  },
  examinations: { permission: "examinations", model: "officerExamination" },
  statuses: { permission: "statusHistories", model: "officerStatusHistory" },
} as const;
export function officerRoutes(db: PrismaClient) {
  const router = Router();
  router.get(
    "/officer-options",
    run(async (_req, res) => {
      need(res, "officers.view");
      const grants = actor(res).grants;
      const allowed = (key: keyof typeof sensitiveFields) =>
        grants.has(fieldPermission(key, "view")) ||
        grants.has(fieldPermission(key, "write"));
      const [ranks, units, subUnits, counties, ethnicities] = await Promise.all(
        [
          allowed("rankHistories")
            ? db.rank.findMany({
                where: { isActive: true },
                select: { id: true, code: true, name: true },
                orderBy: { hierarchyLevel: "asc" },
              })
            : [],
          allowed("assignments")
            ? db.unit.findMany({
                where: { isActive: true },
                select: { id: true, code: true, name: true },
              })
            : [],
          allowed("assignments")
            ? db.subUnit.findMany({
                where: { isActive: true },
                select: { id: true, unitId: true, code: true, name: true },
              })
            : [],
          allowed("countyId")
            ? db.county.findMany({
                select: { id: true, name: true },
                orderBy: { name: "asc" },
              })
            : [],
          allowed("ethnicityId")
            ? db.ethnicity.findMany({
                where: { isActive: true },
                select: { id: true, name: true },
                orderBy: { name: "asc" },
              })
            : [],
        ],
      );
      res.json({
        data: {
          ranks: currentRankReferences(ranks),
          rankGroups: allowed("rankHistories") ? currentPoliceRanks : [],
          units,
          subUnits,
          counties,
          ethnicities,
        },
      });
    }),
  );
  router.get(
    "/officers",
    run(async (req, res) => {
      need(res, "officers.view");
      const q = z
        .object({
          page: z.coerce.number().int().min(1).max(100000).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
          q: z.string().max(100).optional(),
          archive: z.enum(["active", "archived", "all"]).default("active"),
          sort: z
            .enum(["seniority", "rank", "fullName", "forceNumber", "createdAt"])
            .default("seniority"),
          direction: z.enum(["asc", "desc"]).default("asc"),
          recordStatus: z.string().max(50).optional(),
          rankId: z.string().max(191).optional(),
          rank: z.enum([...currentPoliceRanks, "UNKNOWN"]).optional(),
          subUnitId: z.string().max(191).optional(),
        })
        .strict()
        .parse(req.query);
      if (q.rankId) need(res, fieldPermission("rankHistories", "view"));
      if (q.rank || q.sort === "rank")
        need(res, fieldPermission("rankHistories", "view"));
      if (q.subUnitId) need(res, fieldPermission("assignments", "view"));
      const today = new Date(businessDate() + "T00:00:00Z");
      const effective = {
        effectiveFrom: { lte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }],
      };
      const where: Prisma.OfficerWhereInput = {
        ...(q.archive === "active"
          ? { deletedAt: null }
          : q.archive === "archived"
            ? { deletedAt: { not: null } }
            : {}),
        ...(q.q
          ? {
              OR: [
                { forceNumber: { contains: q.q } },
                { fullName: { contains: q.q } },
              ],
            }
          : {}),
        ...(q.recordStatus ? { recordStatus: q.recordStatus } : {}),
        ...(q.rankId
          ? { rankHistories: { some: { rankId: q.rankId, ...effective } } }
          : {}),
        ...(q.subUnitId
          ? {
              assignments: {
                some: { subUnitId: q.subUnitId, isPrimary: true, ...effective },
              },
            }
          : {}),
      };
      const canReadRanks = actor(res).grants.has(
        fieldPermission("rankHistories", "view"),
      );
      const allowSourceRanks = actor(res).grants.has(
        fieldPermission("importRows", "view"),
      );
      let resolvedRanks: Map<string, OfficerRanks> | undefined;
      const [data, total] =
        q.sort === "seniority" || q.sort === "rank" || q.rank
          ? await db.$transaction(
              async (tx) => {
                let candidates = await tx.officer.findMany({
                  where,
                  select: {
                    id: true,
                    forceNumber: true,
                    fullName: true,
                    createdAt: true,
                  },
                });
                if (q.sort === "rank" || q.rank) {
                  resolvedRanks = await officerRanks(
                    tx,
                    candidates,
                    allowSourceRanks,
                  );
                  if (q.rank)
                    candidates = candidates.filter(
                      (o) => resolvedRanks!.get(o.id)?.rank2 === q.rank,
                    );
                }
                candidates.sort((a, b) => {
                  if (q.sort === "rank") {
                    const ap = rankPosition(resolvedRanks!.get(a.id)!.rank2),
                      bp = rankPosition(resolvedRanks!.get(b.id)!.rank2);
                    // Unmapped and historical-only ranks stay outside the current hierarchy.
                    if (
                      ap === currentPoliceRanks.length ||
                      bp === currentPoliceRanks.length
                    )
                      return ap - bp || compareSeniority(a, b);
                    return (
                      (ap - bp) * (q.direction === "desc" ? -1 : 1) ||
                      compareSeniority(a, b)
                    );
                  }
                  if (q.sort === "fullName" || q.sort === "forceNumber")
                    return (
                      a[q.sort].localeCompare(b[q.sort]) *
                        (q.direction === "desc" ? -1 : 1) ||
                      a.id.localeCompare(b.id)
                    );
                  if (q.sort === "createdAt")
                    return (
                      (+a.createdAt - +b.createdAt) *
                        (q.direction === "desc" ? -1 : 1) ||
                      a.id.localeCompare(b.id)
                    );
                  return compareSeniority(a, b);
                });
                // CO stays first; descending reverses the remaining officer ordering only.
                if (q.sort === "seniority" && q.direction === "desc") {
                  const co = candidates.find(
                    (o) => o.forceNumber === process.env.CO_FORCE_NUMBER,
                  );
                  const rest = candidates.filter((o) => o !== co).reverse();
                  candidates.splice(
                    0,
                    candidates.length,
                    ...(co ? [co, ...rest] : rest),
                  );
                }
                const page = candidates.slice(
                  (q.page - 1) * q.pageSize,
                  q.page * q.pageSize,
                );
                const rows = await tx.officer.findMany({
                  where: { id: { in: page.map((o) => o.id) } },
                  select: readSelect(res),
                });
                const positions = new Map(page.map((o, i) => [o.id, i]));
                rows.sort(
                  (a, b) => positions.get(a.id)! - positions.get(b.id)!,
                );
                return [rows, candidates.length] as const;
              },
              { timeout: 60000 },
            )
          : await db.$transaction([
              db.officer.findMany({
                where,
                select: readSelect(res),
                skip: (q.page - 1) * q.pageSize,
                take: q.pageSize,
                orderBy: [{ [q.sort]: q.direction }, { id: "asc" }],
              }),
              db.officer.count({ where }),
            ]);
      if (canReadRanks && !resolvedRanks)
        resolvedRanks = await officerRanks(
          db,
          data as { id: string; forceNumber: string }[],
          allowSourceRanks,
        );
      res.json({
        data: canReadRanks
          ? data.map((o) => ({ ...o, ...resolvedRanks?.get(o.id as string) }))
          : data,
        meta: { total, page: q.page, pageSize: q.pageSize },
      });
    }),
  );
  router.post(
    "/officers",
    run(async (req, res) => {
      need(res, "officers.create");
      const body = createOfficer.parse(req.body);
      checkWrites(res, body);
      checkDates(body, body.serviceProfile?.dateJoinedUnit);
      const {
        serviceProfile,
        initialRank,
        initialAssignment,
        education,
        ...data
      } = body;
      const result = await db.$transaction(async (tx) => {
        if (initialRank || initialAssignment) await organizationLock(tx);
        await references(tx, data);
        if (
          initialRank &&
          !(await tx.rank.findFirst({
            where: { id: initialRank.rankId, isActive: true },
          }))
        )
          throw new HttpError(422, "INVALID_RANK");
        if (initialAssignment) {
          if (
            !(await tx.unit.findFirst({
              where: { id: initialAssignment.unitId, isActive: true },
            }))
          )
            throw new HttpError(422, "INVALID_UNIT");
          if (
            initialAssignment.subUnitId &&
            !(await tx.subUnit.findFirst({
              where: {
                id: initialAssignment.subUnitId,
                unitId: initialAssignment.unitId,
                isActive: true,
              },
            }))
          )
            throw new HttpError(422, "INVALID_SUB_UNIT");
        }
        const officer = await tx.officer.create({
          data: { ...data, recordStatus: "UNVERIFIED" },
        });
        if (serviceProfile)
          await tx.officerServiceProfile.create({
            data: { ...serviceProfile, officerId: officer.id },
          });
        if (education)
          await tx.officerEducation.create({
            data: { ...education, officerId: officer.id },
          });
        const verified = {
          datesVerifiedAt: new Date(),
          datesVerifiedById: actor(res).userId,
        };
        if (initialRank) {
          const { datesVerified, ...rank } = initialRank;
          await tx.officerRankHistory.create({
            data: { ...rank, officerId: officer.id, ...verified },
          });
        }
        if (initialAssignment) {
          const { datesVerified, ...assignment } = initialAssignment;
          await tx.officerAssignment.create({
            data: { ...assignment, officerId: officer.id, ...verified },
          });
        }
        await audit(tx, res, "OFFICER_CREATED", officer.id, Object.keys(body));
        return tx.officer.findUniqueOrThrow({
          where: { id: officer.id },
          select: readSelect(res),
        });
      });
      res.status(201).json({ data: result });
    }),
  );
  router.post(
    "/officers/bulk-archive",
    run(async (req, res) => {
      need(res, "officers.archive");
      const body = z
        .object({
          officers: z
            .array(
              z
                .object({
                  id: z.string().min(1),
                  version: z.number().int().min(0),
                })
                .strict(),
            )
            .min(1)
            .max(50),
        })
        .strict()
        .parse(req.body);
      if (new Set(body.officers.map((x) => x.id)).size !== body.officers.length)
        throw new HttpError(422, "DUPLICATE_SELECTION");
      await db.$transaction(
        async (tx) => {
          for (const item of [...body.officers].sort((a, b) =>
            a.id.localeCompare(b.id),
          )) {
            await tx.$queryRaw`SELECT id FROM Officer WHERE id=${item.id} FOR UPDATE`;
            const result = await tx.officer.updateMany({
              where: { id: item.id, version: item.version, deletedAt: null },
              data: { deletedAt: new Date(), version: { increment: 1 } },
            });
            if (result.count !== 1) throw new HttpError(409, "RECORD_CHANGED");
            await audit(tx, res, "OFFICER_ARCHIVED", item.id, ["deletedAt"]);
          }
        },
        { isolationLevel: "ReadCommitted" },
      );
      res.status(204).end();
    }),
  );
  router.get(
    "/officers/:id",
    run(async (req, res) => {
      need(res, "officers.view");
      const id = z.string().parse(req.params.id);
      const data = await db.officer.findUnique({
        where: { id },
        select: readSelect(res),
      });
      if (!data) throw new HttpError(404, "OFFICER_NOT_FOUND");
      res.json({ data });
    }),
  );
  router.patch(
    "/officers/:id",
    run(async (req, res) => {
      need(res, "officers.update");
      const body = updateOfficer.parse(req.body);
      checkWrites(res, body);
      const id = z.string().parse(req.params.id);
      const { version, serviceProfile, ...data } = body;
      const result = await officerTransaction(db, id, async (tx) => {
        const current = await tx.officer.findUniqueOrThrow({
          where: { id },
          include: { serviceProfile: true },
        });
        if (current.version !== version)
          throw new HttpError(409, "RECORD_CHANGED");
        if (current.deletedAt) throw new HttpError(409, "RESTORE_BEFORE_EDIT");
        checkDates(
          { ...current, ...data },
          serviceProfile?.dateJoinedUnit === undefined
            ? current.serviceProfile?.dateJoinedUnit
            : serviceProfile.dateJoinedUnit,
        );
        await references(tx, data);
        await tx.officer.update({
          where: { id },
          data: { ...data, version: { increment: 1 } },
        });
        if (serviceProfile)
          await tx.officerServiceProfile.upsert({
            where: { officerId: id },
            create: { ...serviceProfile, officerId: id },
            update: serviceProfile,
          });
        await audit(
          tx,
          res,
          "OFFICER_UPDATED",
          id,
          Object.keys(body).filter((x) => x !== "version"),
        );
        return tx.officer.findUniqueOrThrow({
          where: { id },
          select: readSelect(res),
        });
      });
      res.json({ data: result });
    }),
  );
  for (const restore of [false, true])
    router[restore ? "post" : "delete"](
      restore ? "/officers/:id/restore" : "/officers/:id",
      run(async (req, res) => {
        need(res, restore ? "officers.restore" : "officers.archive");
        const { version } = revision.parse(req.body);
        const id = z.string().parse(req.params.id);
        await officerTransaction(db, id, async (tx) => {
          const current = await tx.officer.findUniqueOrThrow({ where: { id } });
          if (
            current.version !== version ||
            Boolean(current.deletedAt) !== restore
          )
            throw new HttpError(409, "RECORD_CHANGED");
          await tx.officer.update({
            where: { id },
            data: {
              deletedAt: restore ? null : new Date(),
              version: { increment: 1 },
            },
          });
          await audit(
            tx,
            res,
            restore ? "OFFICER_RESTORED" : "OFFICER_ARCHIVED",
            id,
            ["deletedAt"],
          );
        });
        res.status(204).end();
      }),
    );
  router.get(
    "/officers/:id/sections/:section",
    run(async (req, res) => {
      need(res, "officers.view");
      const id = z.string().parse(req.params.id);
      const section = z
        .enum([
          "service",
          "assignments",
          "ranks",
          "movements",
          "education",
          "courses",
          "awards",
          "discipline",
          "examinations",
          "statuses",
        ])
        .parse(req.params.section);
      need(res, fieldPermission(sectionConfig[section].permission, "view"));
      if (
        !(await db.officer.findUnique({ where: { id }, select: { id: true } }))
      )
        throw new HttpError(404, "OFFICER_NOT_FOUND");
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .default(1)
        .parse(req.query.page);
      const args = {
        where: { officerId: id },
        skip: (page - 1) * 25,
        take: 25,
        orderBy: { id: "asc" as const },
      };
      let data: unknown;
      switch (section) {
        case "service":
          data = await db.officerServiceProfile.findUnique({
            where: { officerId: id },
          });
          break;
        case "ranks":
          data = await db.officerRankHistory.findMany({
            ...args,
            include: { rank: { select: { code: true, name: true } } },
          });
          break;
        case "assignments":
          data = await db.officerAssignment.findMany({
            ...args,
            include: {
              unit: { select: { name: true, code: true } },
              subUnit: { select: { name: true, code: true } },
            },
          });
          break;
        case "movements":
          data = await db.personnelMovement.findMany({
            ...args,
            include: { movementType: { select: { name: true, code: true } } },
          });
          break;
        case "education":
          data = await db.officerEducation.findMany(args);
          break;
        case "courses":
          data = await db.officerCourse.findMany({
            ...args,
            include: { course: true },
          });
          break;
        case "awards":
          data = await db.officerAward.findMany(args);
          break;
        case "discipline":
          data = await db.officerDisciplinaryRecord.findMany(args);
          break;
        case "examinations":
          data = await db.officerExamination.findMany(args);
          break;
        case "statuses":
          data = await db.officerStatusHistory.findMany(args);
          break;
      }
      await db.auditLog.create({
        data: {
          userId: actor(res).userId,
          action: "OFFICER_SECTION_VIEWED",
          entityType: "Officer",
          entityId: id,
          changedFields: [section],
        },
      });
      res.json({ data, meta: { page, pageSize: 25 } });
    }),
  );
  return router;
}
