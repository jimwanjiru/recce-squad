import { policeRanks, groupCodes, groupLabels } from "../services/dashboard.js";
import argon2 from "argon2";
import { sensitiveFields } from "../config/permissions.js";
import { Router, Request, Response, NextFunction } from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  changeTypes,
  changeLabels,
  changeColumns,
  rawChangeColumns,
  changePermission,
  sourceChangeType,
} from "../services/changes-fields.js";
import { openSource, sourceText } from "../services/workbook-source.js";
import { sealChange } from "../services/change-crypto.js";
import { applyChange } from "../services/apply-change.js";
import { organizationLock } from "../services/organization-lock.js";
import { HttpError } from "../services/errors.js";
import { businessDate, verifiedDate } from "../services/history.js";
const run =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
const actor = (res: Response) =>
  res.locals.identity as { userId: string; grants: Set<string> };
const approvalWrites = [
  "fields.personnel_movements.write",
  "fields.assignments.write",
  "fields.rank_history.write",
  "fields.status_history.write",
];
function need(res: Response, write = false, approve = false) {
  const g = actor(res).grants;
  if (
    !changePermission(g, "view") ||
    (write &&
      (approve
        ? !g.has("movements.approve") || approvalWrites.some((p) => !g.has(p))
        : !changePermission(g, "write") || !g.has("movements.create")))
  )
    throw new HttpError(403, "PERMISSION_DENIED");
}
const cellSchema = z.record(
  z.string().regex(/^(?:[1-9]|[12]\d|3[0-8])$/),
  z.string().max(20000),
);
const input = z
  .object({
    officerId: z.string().max(191),
    eventType: z.enum(changeTypes),
    effectiveDate: z.string().nullable(),
    cells: cellSchema,
    targetUnitId: z.string().max(191).nullable().optional(),
    targetSubUnitId: z.string().max(191).nullable().optional(),
    targetRankId: z.string().max(191).nullable().optional(),
    sourceImportRowId: z.string().max(191).optional(),
    amendsId: z.string().max(191).optional(),
  })
  .strict();
const revision = z.object({ revision: z.number().int().min(0) }).strict();
function sourceForce(raw: Record<string, any>) {
  let force = sourceText(raw["2"]).trim();
  const format = raw._numberFormats?.["2"];
  if (typeof raw["2"] === "number" && /^0+$/.test(format || ""))
    force = force.padStart(format.length, "0");
  return force;
}
const fullCells = (cells: Record<string, string>) =>
  Object.fromEntries(
    Array.from({ length: 38 }, (_, i) => [
      String(i + 1),
      cells[String(i + 1)] || "",
    ]),
  );
async function audit(
  tx: Prisma.TransactionClient,
  res: Response,
  action: string,
  id: string,
  fields: string[],
  entityType = "OfficerChange",
) {
  await tx.auditLog.create({
    data: {
      userId: actor(res).userId,
      action,
      entityType,
      entityId: id,
      changedFields: fields,
    },
  });
}
async function transaction<T>(
  db: PrismaClient,
  officerId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await organizationLock(tx);
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM Officer WHERE id=${officerId} FOR UPDATE`;
      if (!rows.length) throw new HttpError(404, "OFFICER_NOT_FOUND");
      return fn(tx);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 30000,
      maxWait: 10000,
    },
  );
}
export function changesRoutes(db: PrismaClient) {
  const router = Router();
  router.post(
    "/changes/examples",
    run(async (_req, res) => {
      need(res, true);
      if (!actor(res).grants.has("officers.create"))
        throw new HttpError(403, "PERMISSION_DENIED");
      const year = Number(businessDate().slice(0, 4));
      const result = await db.$transaction(
        async (tx) => {
          await organizationLock(tx);
          let created = 0;
          for (const [index, spec] of ["C.I(W)", "C.I"].entries()) {
            const forceNumber =
                "DEMO-CHANGES-" + String(index + 1).padStart(3, "0"),
              fullName = "Fictional Change Example " + (index + 1);
            let officer = await tx.officer.findUnique({
              where: { forceNumber },
            });
            if (officer && officer.fullName !== fullName)
              throw new HttpError(409, "DEMO_RECORD_CONFLICT");
            if (!officer)
              officer = await tx.officer.create({
                data: { forceNumber, fullName, recordStatus: "UNVERIFIED" },
              });
            if (
              await tx.officerChange.count({ where: { officerId: officer.id } })
            )
              continue;
            const id = randomUUID(),
              date = `${year - index}-02-15`;
            const cells = fullCells({
              "1": String(index + 1),
              "2": forceNumber,
              "3": spec,
              "4": "CI",
              "5": fullName,
              "6": "Fictional station",
              "7": index ? "RRT" : "MO",
              "8": "Fictional destination",
              "9": `DEMO/GSU/${index + 1}`,
              "10": date,
              "14": `DEMO/KPS/${index + 1}`,
              "15": date,
            });
            await tx.officerChange.create({
              data: {
                id,
                officerId: officer.id,
                eventType: "TRANSFER_OUT",
                effectiveDate: verifiedDate(date),
                recordedById: actor(res).userId,
                workbookCells: await sealChange(
                  cells,
                  id,
                  (await tx.importBatch.count()) === 0 &&
                    (await tx.officerChange.count()) === 0,
                ),
              },
            });
            created++;
          }
          await audit(
            tx,
            res,
            "FICTIONAL_CHANGE_EXAMPLES_CREATED",
            "demo-changes",
            ["draftExamples"],
          );
          return { created };
        },
        { timeout: 30000 },
      );
      res.json({ data: result });
    }),
  );
  router.post(
    "/changes/examples/remove",
    run(async (_req, res) => {
      need(res, true);
      if (!actor(res).grants.has("officers.archive"))
        throw new HttpError(403, "PERMISSION_DENIED");
      const result = await db.$transaction(async (tx) => {
        await organizationLock(tx);
        let removed = 0;
        for (const index of [1, 2]) {
          const forceNumber = "DEMO-CHANGES-" + String(index).padStart(3, "0");
          const officer = await tx.officer.findUnique({
            where: { forceNumber },
            include: {
              changes: true,
              _count: {
                select: {
                  assignments: true,
                  rankHistories: true,
                  statusHistories: true,
                  movements: true,
                  importRows: true,
                  education: true,
                  courses: true,
                  awards: true,
                  disciplinaryRecords: true,
                  examinations: true,
                },
              },
              serviceProfile: true,
              financialDetail: true,
            },
          });
          if (!officer) continue;
          if (
            officer.fullName !== "Fictional Change Example " + index ||
            officer.version !== 0 ||
            officer.changes.some(
              (c) => c.status !== "DRAFT" || c.sourceImportRowId || c.amendsId,
            ) ||
            Object.values(officer._count).some((n) => n > 0) ||
            officer.serviceProfile ||
            officer.financialDetail
          )
            throw new HttpError(409, "DEMO_RECORD_MODIFIED");
          await tx.officerChange.deleteMany({
            where: { officerId: officer.id },
          });
          await tx.officer.delete({ where: { id: officer.id } });
          removed++;
        }
        await audit(
          tx,
          res,
          "FICTIONAL_CHANGE_EXAMPLES_REMOVED",
          "demo-changes",
          ["draftExamples"],
        );
        return { removed };
      });
      res.json({ data: result });
    }),
  );

  router.post(
    "/changes/references",
    run(async (_req, res) => {
      need(res);
      if (
        ["ranks.manage", "units.manage", "sub_units.manage"].some(
          (p) => !actor(res).grants.has(p),
        )
      )
        throw new HttpError(403, "PERMISSION_DENIED");
      await db.$transaction(
        async (tx) => {
          await organizationLock(tx);
          const unit = await tx.unit.upsert({
            where: { code: "RECCE" },
            create: { code: "RECCE", name: "RECCE" },
            update: {},
          });
          for (const code of groupCodes.filter((code) => code !== "NA"))
            await tx.subUnit.upsert({
              where: { unitId_code: { unitId: unit.id, code } },
              create: { unitId: unit.id, code, name: groupLabels[code]! },
              update: {},
            });
          for (const [index, code] of policeRanks.entries())
            await tx.rank.upsert({
              where: { code },
              create: { code, name: code, hierarchyLevel: index },
              update: {},
            });
          await audit(tx, res, "CHANGE_REFERENCE_VALUES_PREPARED", unit.id, [
            "rankCodes",
            "subUnitCodes",
          ]);
        },
        { timeout: 30000 },
      );
      res.json({ data: { prepared: true } });
    }),
  );
  router.post(
    "/changes/approvers",
    run(async (req, res) => {
      need(res);
      if (
        !actor(res).grants.has("users.manage") ||
        !actor(res).grants.has("roles.manage")
      )
        throw new HttpError(403, "PERMISSION_DENIED");
      const body = z
        .object({
          name: z.string().trim().min(1).max(191),
          email: z.string().email().max(191),
          password: z.string().min(14).max(200),
        })
        .strict()
        .parse(req.body);
      const passwordHash = await argon2.hash(body.password, {
        type: argon2.argon2id,
      });
      const result = await db.$transaction(
        async (tx) => {
          await organizationLock(tx);
          if (await tx.user.findUnique({ where: { email: body.email } }))
            throw new HttpError(409, "APPROVER_EMAIL_EXISTS");
          let role = await tx.role.findUnique({
            where: { name: "Personnel Change Approver" },
          });
          if (!role) {
            role = await tx.role.create({
              data: { name: "Personnel Change Approver" },
            });
            const grants = [
              "officers.view",
              "movements.approve",
              ...Object.values(sensitiveFields).map((f) => `fields.${f}.view`),
              "fields.personnel_movements.write",
              "fields.assignments.write",
              "fields.rank_history.write",
              "fields.status_history.write",
            ];
            for (const code of grants) {
              const permission = await tx.permission.upsert({
                where: { code },
                create: { code, description: code },
                update: {},
              });
              await tx.rolePermission.create({
                data: { roleId: role.id, permissionId: permission.id },
              });
            }
          }
          const user = await tx.user.create({
            data: {
              name: body.name,
              email: body.email,
              passwordHash,
              roles: { create: { roleId: role.id } },
            },
          });
          await audit(tx, res, "CHANGE_APPROVER_ACCOUNT_CREATED", user.id, [
            "name",
            "email",
            "role",
          ]);
          return { id: user.id, email: user.email };
        },
        { timeout: 30000 },
      );
      res.status(201).json({ data: result });
    }),
  );

  router.get(
    "/changes/options",
    run(async (_req, res) => {
      need(res);
      const [dates, units, subUnits, ranks] = await Promise.all([
        db.officerChange.findMany({
          where: { deletedAt: null },
          select: { effectiveDate: true },
          distinct: ["effectiveDate"],
        }),
        db.unit.findMany({
          where: { isActive: true },
          select: { id: true, code: true, name: true },
          orderBy: { code: "asc" },
        }),
        db.subUnit.findMany({
          where: { isActive: true, unit: { isActive: true } },
          select: { id: true, unitId: true, code: true, name: true },
          orderBy: { code: "asc" },
        }),
        db.rank.findMany({
          where: { isActive: true },
          select: { id: true, code: true, name: true },
          orderBy: { hierarchyLevel: "asc" },
        }),
      ]);
      const years = [
        ...new Set([
          Number(businessDate().slice(0, 4)),
          ...dates.flatMap((d) =>
            d.effectiveDate ? [d.effectiveDate.getUTCFullYear()] : [],
          ),
        ]),
      ].sort((a, b) => b - a);
      res.json({
        data: {
          sourceColumns: rawChangeColumns(),
          types: changeTypes.map((code) => ({
            code,
            label: changeLabels[code],
            columns: changeColumns(code),
          })),
          years,
          units,
          subUnits,
          ranks,
          canCreate:
            changePermission(actor(res).grants, "write") &&
            actor(res).grants.has("movements.create"),
          canApprove:
            actor(res).grants.has("movements.approve") &&
            approvalWrites.every((p) => actor(res).grants.has(p)),
          canPrepareReferences: [
            "ranks.manage",
            "units.manage",
            "sub_units.manage",
          ].every((p) => actor(res).grants.has(p)),
          canManageApprovers:
            actor(res).grants.has("users.manage") &&
            actor(res).grants.has("roles.manage"),
          userId: actor(res).userId,
        },
      });
    }),
  );
  router.get(
    "/changes/source",
    run(async (req, res) => {
      need(res);
      const q = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(50).default(10),
        })
        .strict()
        .parse(req.query);
      const batch = await db.importBatch.findFirst({
        where: {
          status: { not: "ROLLED_BACK" },
          rows: { some: { sheetName: "CHANGES" } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      if (!batch)
        return res.json({
          data: [],
          meta: { total: 0, ...q },
          columns: rawChangeColumns(),
        });
      const where = { batchId: batch.id, sheetName: "CHANGES" };
      const [rows, total] = await db.$transaction([
        db.importRow.findMany({
          where,
          include: { change: { select: { id: true, status: true } } },
          orderBy: { rowNumber: "asc" },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        db.importRow.count({ where }),
      ]);
      const data = [];
      for (const row of rows) {
        const raw = await openSource(
          row.rawData,
          `${batch.fileSha256}:${row.sheetName}:${row.rowNumber}`,
        );
        const sourceType = sourceChangeType(row.rowNumber),
          force = sourceForce(raw);
        const officer =
          sourceType && force
            ? await db.officer.findUnique({
                where: { forceNumber: force },
                select: {
                  id: true,
                  forceNumber: true,
                  fullName: true,
                  deletedAt: true,
                },
              })
            : null;
        data.push({
          id: row.id,
          row: row.rowNumber,
          cells: fullCells(
            Object.fromEntries(
              Array.from({ length: 38 }, (_, i) => [
                String(i + 1),
                sourceText(raw[String(i + 1)]),
              ]),
            ),
          ),
          suggestedType: sourceType,
          officer: officer && !officer.deletedAt ? officer : null,
          change: row.change,
        });
      }
      res.json({ data, meta: { total, ...q }, columns: rawChangeColumns() });
    }),
  );
  router.get(
    "/changes",
    run(async (req, res) => {
      need(res);
      const q = z
        .object({
          year: z
            .string()
            .regex(/^(?:\d{4}|undated)$/)
            .default(businessDate().slice(0, 4)),
          eventType: z.enum(changeTypes).optional(),
          status: z.enum(["DRAFT", "SUBMITTED", "APPLIED"]).optional(),
          q: z.string().trim().max(100).optional(),
          page: z.coerce.number().int().min(1).max(100000).default(1),
          pageSize: z.coerce.number().int().min(1).max(50).default(10),
        })
        .strict()
        .parse(req.query);
      const start =
        q.year === "undated" ? null : verifiedDate(q.year + "-01-01");
      const next = start ? new Date(start) : null;
      if (next) next.setUTCFullYear(next.getUTCFullYear() + 1);
      const where: Prisma.OfficerChangeWhereInput = {
        deletedAt: null,
        effectiveDate: start ? { gte: start, lt: next! } : null,
        ...(q.eventType ? { eventType: q.eventType } : {}),
        ...(q.status ? { status: q.status } : {}),
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
      const [rows, total] = await db.$transaction([
        db.officerChange.findMany({
          where,
          include: {
            officer: {
              select: { id: true, forceNumber: true, fullName: true },
            },
            recordedBy: { select: { name: true } },
            approvedBy: { select: { name: true } },
          },
          orderBy: [
            { effectiveDate: "desc" },
            { createdAt: "desc" },
            { id: "asc" },
          ],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        db.officerChange.count({ where }),
      ]);
      const data = [];
      for (const row of rows) {
        const raw = await openSource(row.workbookCells, "changes:" + row.id);
        data.push({
          ...row,
          workbookCells: undefined,
          cells: fullCells(raw as Record<string, string>),
        });
      }
      res.json({
        data,
        meta: { total, page: q.page, pageSize: q.pageSize, year: q.year },
        columns: changeColumns(q.eventType),
      });
    }),
  );
  router.post(
    "/changes",
    run(async (req, res) => {
      need(res, true);
      const body = input.parse(req.body);
      const date = body.effectiveDate ? verifiedDate(body.effectiveDate) : null;
      const result = await transaction(db, body.officerId, async (tx) => {
        const officer = await tx.officer.findUniqueOrThrow({
          where: { id: body.officerId },
        });
        if (officer.deletedAt) throw new HttpError(409, "RESTORE_BEFORE_EDIT");
        let cells = fullCells(body.cells);
        if (body.sourceImportRowId) {
          if (
            await tx.officerChange.findUnique({
              where: { sourceImportRowId: body.sourceImportRowId },
            })
          )
            throw new HttpError(409, "CHANGE_SOURCE_ALREADY_LINKED");
          const source = await tx.importRow.findUnique({
            where: { id: body.sourceImportRowId },
            include: { batch: true },
          });
          if (
            !source ||
            source.sheetName !== "CHANGES" ||
            source.batch.status === "ROLLED_BACK" ||
            !sourceChangeType(source.rowNumber)
          )
            throw new HttpError(422, "CHANGE_SOURCE_NOT_AN_OFFICER_EVENT");
          const raw = await openSource(
            source.rawData,
            `${source.batch.fileSha256}:${source.sheetName}:${source.rowNumber}`,
          );
          if (sourceForce(raw) !== officer.forceNumber)
            throw new HttpError(409, "WORKBOOK_OFFICER_IDENTITY_MISMATCH");
          cells = fullCells({
            ...Object.fromEntries(
              Array.from({ length: 38 }, (_, i) => [
                String(i + 1),
                sourceText(raw[String(i + 1)]),
              ]),
            ),
            ...body.cells,
          });
        }
        if (cells["2"] && cells["2"] !== officer.forceNumber)
          throw new HttpError(409, "WORKBOOK_OFFICER_IDENTITY_MISMATCH");
        cells["2"] = officer.forceNumber;
        if (!cells["5"]) cells["5"] = officer.fullName;
        if (body.amendsId) {
          const original = await tx.officerChange.findUnique({
            where: { id: body.amendsId },
          });
          if (
            !original ||
            original.status !== "APPLIED" ||
            original.officerId !== officer.id
          )
            throw new HttpError(422, "INVALID_CHANGE_AMENDMENT");
        }
        const id = randomUUID(),
          mayCreateKey =
            (await tx.importBatch.count()) === 0 &&
            (await tx.officerChange.count()) === 0;
        const encrypted = await sealChange(cells, id, mayCreateKey);
        const record = await tx.officerChange.create({
          data: {
            id,
            officerId: officer.id,
            eventType: body.eventType,
            effectiveDate: date,
            workbookCells: encrypted,
            recordedById: actor(res).userId,
            sourceImportRowId: body.sourceImportRowId,
            amendsId: body.amendsId,
            targetUnitId: body.targetUnitId,
            targetSubUnitId: body.targetSubUnitId,
            targetRankId: body.targetRankId,
          },
        });
        await audit(tx, res, "OFFICER_CHANGE_CREATED", id, [
          "officerId",
          "eventType",
          "effectiveDate",
          "workbookColumns_A_AL",
        ]);
        return record;
      });
      res.status(201).json({
        data: {
          id: result.id,
          revision: result.revision,
          year: date ? date.getUTCFullYear() : "undated",
        },
      });
    }),
  );
  router.patch(
    "/changes/:id",
    run(async (req, res) => {
      need(res, true);
      const body = input
        .omit({ sourceImportRowId: true, amendsId: true })
        .extend({ revision: z.number().int().min(0) })
        .parse(req.body);
      const result = await transaction(db, body.officerId, async (tx) => {
        const row = await tx.officerChange.findUnique({
          where: { id: String(req.params.id) },
          include: { officer: true },
        });
        if (!row || row.deletedAt) throw new HttpError(404, "CHANGE_NOT_FOUND");
        if (row.officerId !== body.officerId)
          throw new HttpError(409, "WORKBOOK_OFFICER_IDENTITY_MISMATCH");
        if (row.status !== "DRAFT" || row.revision !== body.revision)
          throw new HttpError(409, "CHANGE_REVISION_CONFLICT");
        if (body.cells["2"] && body.cells["2"] !== row.officer.forceNumber)
          throw new HttpError(409, "WORKBOOK_OFFICER_IDENTITY_MISMATCH");
        const before = await openSource(row.workbookCells, "changes:" + row.id);
        const cells = fullCells({ ...before, ...body.cells });
        cells["2"] = row.officer.forceNumber;
        const record = await tx.officerChange.update({
          where: { id: row.id },
          data: {
            eventType: body.eventType,
            effectiveDate: body.effectiveDate
              ? verifiedDate(body.effectiveDate)
              : null,
            targetUnitId: body.targetUnitId,
            targetSubUnitId: body.targetSubUnitId,
            targetRankId: body.targetRankId,
            workbookCells: await sealChange(cells, row.id),
            recordedById: actor(res).userId,
            revision: { increment: 1 },
          },
        });
        await audit(tx, res, "OFFICER_CHANGE_UPDATED", row.id, [
          "eventType",
          "effectiveDate",
          "workbookColumns_A_AL",
        ]);
        return record;
      });
      res.json({ data: { id: result.id, revision: result.revision } });
    }),
  );
  router.delete(
    "/changes/:id",
    run(async (req, res) => {
      need(res, true);
      const body = revision.parse(req.body),
        id = String(req.params.id);
      const existing = await db.officerChange.findUnique({ where: { id } });
      if (!existing) throw new HttpError(404, "CHANGE_NOT_FOUND");
      await transaction(db, existing.officerId, async (tx) => {
        const row = await tx.officerChange.findUniqueOrThrow({ where: { id } });
        if (row.status !== "DRAFT" || row.revision !== body.revision)
          throw new HttpError(409, "CHANGE_REVISION_CONFLICT");
        await tx.officerChange.delete({ where: { id } });
        await audit(tx, res, "OFFICER_CHANGE_DRAFT_DELETED", id, ["draft"]);
      });
      res.status(204).end();
    }),
  );
  router.post(
    "/changes/:id/:action",
    run(async (req, res) => {
      const action = z
        .enum(["submit", "return", "approve"])
        .parse(req.params.action);
      need(res, true, action === "approve");
      const body =
        action === "approve"
          ? revision.extend({ datesVerified: z.literal(true) }).parse(req.body)
          : revision.parse(req.body);
      const id = String(req.params.id),
        existing = await db.officerChange.findUnique({ where: { id } });
      if (!existing) throw new HttpError(404, "CHANGE_NOT_FOUND");
      const result = await transaction(db, existing.officerId, async (tx) => {
        if (action === "approve")
          return applyChange(tx, id, actor(res).userId, body.revision);
        const row = await tx.officerChange.findUniqueOrThrow({ where: { id } });
        if (
          row.revision !== body.revision ||
          row.status !== (action === "submit" ? "DRAFT" : "SUBMITTED")
        )
          throw new HttpError(409, "CHANGE_REVISION_CONFLICT");
        if (action === "submit" && !row.effectiveDate)
          throw new HttpError(422, "VERIFIED_DATE_REQUIRED");
        const record = await tx.officerChange.update({
          where: { id },
          data: {
            status: action === "submit" ? "SUBMITTED" : "DRAFT",
            revision: { increment: 1 },
          },
        });
        await audit(tx, res, "OFFICER_CHANGE_" + action.toUpperCase(), id, [
          "status",
        ]);
        return record;
      });
      res.json({
        data: {
          id: result.id,
          status: result.status,
          revision: result.revision,
        },
      });
    }),
  );
  return router;
}
