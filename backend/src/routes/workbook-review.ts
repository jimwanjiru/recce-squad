import { Router, Request, Response, NextFunction } from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { HttpError } from "../services/errors.js";
import { organizationLock } from "../services/organization-lock.js";
import {
  openSource,
  sourceText,
  checkSourceOfficer,
  canColumn,
  workbookColumns,
} from "../services/workbook-source.js";
const run =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
const identity = (res: Response) =>
  res.locals.identity as { userId: string; grants: Set<string> };
function need(res: Response, ...permissions: string[]) {
  if (permissions.some((p) => !identity(res).grants.has(p)))
    throw new HttpError(403, "PERMISSION_DENIED");
}
const reviewKey = (id: string) => "_import.review." + id;
export function workbookReviewRoutes(db: PrismaClient) {
  const router = Router();
  router.get(
    "/officers/:id/workbook-details",
    run(async (req, res) => {
      need(res, "officers.view", "fields.import_source.view");
      const id = z.string().max(191).parse(req.params.id);
      const officer = await db.officer.findUnique({
        where: { id },
        select: { forceNumber: true, fullName: true },
      });
      if (!officer) throw new HttpError(404, "OFFICER_NOT_FOUND");
      const rows = await db.importRow.findMany({
        where: { officerId: id, sheetName: "NAMES" },
        include: { batch: true },
        orderBy: { rowNumber: "asc" },
        take: 20,
      });
      const data = [];
      for (const row of rows) {
        if (row.batch.status === "ROLLED_BACK") continue;
        const raw = await openSource(
          row.rawData,
          `${row.batch.fileSha256}:${row.sheetName}:${row.rowNumber}`,
        );
        checkSourceOfficer(raw, officer);
        const saved = await db.systemSetting.findUnique({
          where: { settingKey: reviewKey(row.id) },
        });
        const state = (saved?.settingValue || {}) as Record<string, any>;
        const fields = workbookColumns.flatMap(([label], index) => {
          const column = index + 1;
          if (!canColumn(identity(res).grants, column, "view")) return [];
          return [
            {
              column,
              label,
              value: sourceText(raw[String(column)]),
              review: state[String(column)] || null,
              canReview:
                identity(res).grants.has("imports.commit") &&
                identity(res).grants.has("fields.import_source.write") &&
                canColumn(identity(res).grants, column, "write"),
            },
          ];
        });
        data.push({
          rowId: row.id,
          batchId: row.batchId,
          sheet: row.sheetName,
          row: row.rowNumber,
          fields,
          identityCheck: {
            forceNumberMatches: true,
            nameMatches: sourceText(raw["6"]).trim() === officer.fullName,
          },
        });
      }
      res.json({ data });
    }),
  );
  router.post(
    "/officers/:id/workbook-details/:rowId/review",
    run(async (req, res) => {
      need(
        res,
        "officers.view",
        "imports.commit",
        "fields.import_source.view",
        "fields.import_source.write",
      );
      const body = z
        .object({
          column: z.number().int().min(1).max(38),
          decision: z.enum(["CHECKED", "NEEDS_CORRECTION"]),
          expectedRevision: z.number().int().min(0),
        })
        .strict()
        .parse(req.body);
      if (
        !canColumn(identity(res).grants, body.column, "view") ||
        !canColumn(identity(res).grants, body.column, "write")
      )
        throw new HttpError(403, "PERMISSION_DENIED");
      const id = z.string().max(191).parse(req.params.id),
        rowId = z.string().max(191).parse(req.params.rowId);
      await db.$transaction(async (tx) => {
        await organizationLock(tx);
        const row = await tx.importRow.findFirst({
          where: { id: rowId, officerId: id, sheetName: "NAMES" },
          include: { batch: true, officer: true },
        });
        if (!row?.officer || row.batch.status === "ROLLED_BACK")
          throw new HttpError(404, "IMPORT_ROW_NOT_FOUND");
        const raw = await openSource(
          row.rawData,
          `${row.batch.fileSha256}:${row.sheetName}:${row.rowNumber}`,
        );
        checkSourceOfficer(raw, row.officer);
        const saved = await tx.systemSetting.findUnique({
          where: { settingKey: reviewKey(row.id) },
        });
        const state = (saved?.settingValue || {}) as Record<string, any>;
        const field = String(body.column),
          revision = state[field]?.revision || 0;
        if (body.expectedRevision !== revision)
          throw new HttpError(409, "STALE_SOURCE_REVIEW");
        state[field] = {
          decision: body.decision,
          revision: revision + 1,
          reviewedById: identity(res).userId,
          reviewedAt: new Date().toISOString(),
        };
        await tx.systemSetting.upsert({
          where: { settingKey: reviewKey(row.id) },
          create: {
            settingKey: reviewKey(row.id),
            settingValue: state as Prisma.InputJsonObject,
          },
          update: { settingValue: state as Prisma.InputJsonObject },
        });
        await tx.importRow.update({
          where: { id: row.id },
          data: { verificationStatus: "PARTIALLY_REVIEWED" },
        });
        await tx.auditLog.create({
          data: {
            userId: identity(res).userId,
            action: "WORKBOOK_SOURCE_FIELD_REVIEWED",
            entityType: "ImportRow",
            entityId: row.id,
            changedFields: ["column_" + field, body.decision],
          },
        });
      });
      res.json({ data: { saved: true } });
    }),
  );
  router.get(
    "/workbook-source",
    run(async (req, res) => {
      need(res, "officers.view", "fields.import_source.view");
      // Sectioned sheets have unknown column semantics; require all sensitive read grants.
      if (
        workbookColumns.some(
          (_column, index) =>
            !canColumn(identity(res).grants, index + 1, "view"),
        )
      )
        throw new HttpError(403, "PERMISSION_DENIED");
      const q = z
        .object({
          batchId: z.string().max(191),
          sheet: z.enum(["TRIBE", "CHANGES", "SUB UNIT STRENGTH"]),
          page: z.coerce.number().int().min(1).max(100000).default(1),
        })
        .strict()
        .parse(req.query);
      const batch = await db.importBatch.findUnique({
        where: { id: q.batchId },
      });
      if (!batch || batch.status === "ROLLED_BACK")
        throw new HttpError(404, "IMPORT_BATCH_NOT_FOUND");
      const rows = await db.importRow.findMany({
        where: {
          batchId: batch.id,
          sheetName:
            q.sheet === "TRIBE" ? { in: ["TRIBE", "TRIBE "] } : q.sheet,
        },
        orderBy: { rowNumber: "asc" },
        skip: (q.page - 1) * 25,
        take: 25,
      });
      const data = [];
      for (const row of rows) {
        const raw = await openSource(
          row.rawData,
          `${batch.fileSha256}:${row.sheetName}:${row.rowNumber}`,
        );
        const cells = Object.entries(raw)
          .filter(([key]) => /^\d+$/.test(key))
          .map(([column, value]) => ({
            column: Number(column),
            value: sourceText(value),
          }));
        data.push({ row: row.rowNumber, cells });
      }
      res.json({ data });
    }),
  );
  return router;
}
