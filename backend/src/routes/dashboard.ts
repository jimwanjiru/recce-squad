import { Router } from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { HttpError } from "../services/errors.js";
import { dashboardSummary } from "../services/dashboard.js";
export function dashboardRoutes(db: PrismaClient) {
  const router = Router();
  router.get("/dashboard", async (_req, res, next) => {
    try {
      const grants = (res.locals.identity as { grants: Set<string> }).grants;
      if (
        [
          "reports.view",
          "officers.view",
          "fields.import_source.view",
          "fields.assignments.view",
          "fields.service_profile.view",
          "fields.rank_history.view",
        ].some((p) => !grants.has(p))
      )
        throw new HttpError(403, "PERMISSION_DENIED");
      const summary = await db.$transaction((tx) => dashboardSummary(tx), {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 60000,
        maxWait: 10000,
      });
      res.json({ data: summary });
    } catch (error) {
      next(error);
    }
  });
  router.get("/personnel-summaries", async (req, res, next) => {
    try {
      const { z } = await import("zod");
      const q = z
        .object({
          section: z.enum(["TRIBE", "SUB UNIT STRENGTH"]),
          page: z.coerce.number().int().min(1).max(100000).default(1),
        })
        .strict()
        .parse(req.query);
      const grants = (res.locals.identity as { grants: Set<string> }).grants;
      const required = [
        "reports.view",
        "fields.rank_history.view",
        q.section === "TRIBE"
          ? "fields.ethnicity.view"
          : "fields.assignments.view",
      ];
      if (required.some((p) => !grants.has(p)))
        throw new HttpError(403, "PERMISSION_DENIED");
      const batch = await db.importBatch.findFirst({
        where: {
          status: { not: "ROLLED_BACK" },
          summaryRecords: { some: { section: q.section } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      if (!batch) {
        res.json({ data: [], meta: { total: 0, page: q.page, pageSize: 25 } });
        return;
      }
      const where = { batchId: batch.id, section: q.section };
      const [rows, total] = await db.$transaction([
        db.personnelSummaryRecord.findMany({
          where,
          orderBy: { position: "asc" },
          skip: (q.page - 1) * 25,
          take: 25,
        }),
        db.personnelSummaryRecord.count({ where }),
      ]);
      const tribeHeaders = [
        "",
        "",
        "Ethnicity",
        "S/AIG",
        "AIG",
        "CP",
        "SSP",
        "SP",
        "ASP",
        "CI",
        "IP",
        "S/SGT",
        "SGT",
        "CPL",
        "PC",
        "Total",
      ];
      const { strengthRankColumns } = await import("../services/dashboard.js");
      res.json({
        data: rows.map((row) => ({
          id: row.id,
          fields: Object.entries(row.cells as Record<string, string>)
            .filter(([column]) => !(q.section === "TRIBE" && column === "1"))
            .map(([column, value]) => ({
              label:
                q.section === "TRIBE"
                  ? tribeHeaders[Number(column)] || "Additional information"
                  : Number(column) === 1
                    ? "Sub-unit / description"
                    : Object.entries(strengthRankColumns).find(
                        ([, c]) => c === Number(column),
                      )?.[0] ||
                      (column === "37"
                        ? "Total"
                        : column === "38"
                          ? "Additional total"
                          : "Additional information"),
              value,
            })),
        })),
        meta: { total, page: q.page, pageSize: 25 },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
