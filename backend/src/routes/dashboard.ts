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
  return router;
}
