import { Router } from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { groupCodes, policeRanks } from "../services/dashboard.js";
import { groupRoster, rosterPermissions } from "../services/group-roster.js";
import { HttpError } from "../services/errors.js";
export function groupRosterRoutes(db: PrismaClient) {
  const router = Router();
  router.get("/organization/groups", async (req, res, next) => {
    try {
      const grants = (res.locals.identity as { grants: Set<string> }).grants;
      if (rosterPermissions.some((permission) => !grants.has(permission)))
        throw new HttpError(403, "PERMISSION_DENIED");
      const query = z
        .object({
          group: z
            .enum(["ALL", "RECCE", ...groupCodes, "OTHER", "UNSPECIFIED"])
            .default("ALL"),
          rank: z.enum([...policeRanks, "UNKNOWN"]).optional(),
          q: z.string().trim().max(100).optional(),
          page: z.coerce.number().int().min(1).max(100000).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        })
        .strict()
        .parse(req.query);
      const result = await db.$transaction((tx) => groupRoster(tx, query), {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 60000,
        maxWait: 10000,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
  return router;
}
