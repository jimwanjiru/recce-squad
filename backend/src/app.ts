import express, { Request, Response, NextFunction } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import argon2 from "argon2";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { z, ZodError } from "zod";
import { HttpError } from "./services/errors.js";
import { organizationRoutes } from "./routes/organization.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { workbookReviewRoutes } from "./routes/workbook-review.js";
import { officerRoutes } from "./routes/officers.js";
export type AppOptions = {
  origin: string;
  production: boolean;
  sessionHours?: number;
};
type Identity = {
  userId: string;
  sessionId: string;
  csrfTokenHash: string;
  grants: Set<string>;
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export async function createApp(db: PrismaClient, options: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.set("query parser", "simple");
  app.use(helmet());
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  const cookieName = options.production
    ? "__Host-recce_session"
    : "recce_session";
  const cookieOptions = {
    httpOnly: true,
    secure: options.production,
    sameSite: "strict" as const,
    path: "/",
  };
  const dummyHash = await argon2.hash(randomBytes(32), {
    type: argon2.argon2id,
  });
  const asyncRoute =
    (
      fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
    ) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  const audit = async (
    tx: Prisma.TransactionClient,
    userId: string | null,
    action: string,
    entityId: string,
    fields: string[] = [],
    entityType: string = "User",
  ) =>
    tx.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        changedFields: fields,
      },
    });
  app.get(
    "/api/health",
    asyncRoute(async (_req, res) => {
      await db.$queryRaw`SELECT 1`;
      res.json({ data: { status: "ok" } });
    }),
  );
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "LOGIN_RATE_LIMIT" } },
  });
  app.post(
    "/api/auth/login",
    loginLimit,
    asyncRoute(async (req, res) => {
      if (req.get("origin") !== options.origin)
        throw new HttpError(403, "ORIGIN_REJECTED");
      const body = z
        .object({
          email: z
            .string()
            .email()
            .max(254)
            .transform((x) => x.toLowerCase()),
          password: z.string().min(1).max(256),
        })
        .strict()
        .parse(req.body);
      const user = await db.user.findUnique({ where: { email: body.email } });
      const correct = await argon2.verify(
        user?.passwordHash ?? dummyHash,
        body.password,
      );
      if (!user || !user.isActive || !correct)
        throw new HttpError(401, "INVALID_CREDENTIALS");
      const token = randomBytes(32).toString("base64url"),
        csrf = randomBytes(32).toString("base64url");
      const expiresAt = new Date(
        Date.now() + (options.sessionHours ?? 8) * 3600000,
      );
      await db.$transaction(async (tx) => {
        // Lock and recheck activity: disabling an account cannot race a new session.
        await tx.$queryRaw`SELECT id FROM User WHERE id=${user.id} FOR UPDATE`;
        const current = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
        });
        if (!current.isActive || current.passwordHash !== user.passwordHash)
          throw new HttpError(401, "INVALID_CREDENTIALS");
        const old = req.cookies[cookieName];
        if (typeof old === "string")
          await tx.userSession.updateMany({
            where: { tokenHash: hash(old), revokedAt: null },
            data: { revokedAt: new Date() },
          });
        await tx.userSession.create({
          data: {
            userId: user.id,
            tokenHash: hash(token),
            csrfTokenHash: hash(csrf),
            expiresAt,
          },
        });
        await tx.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        await audit(tx, user.id, "AUTH_LOGIN", user.id);
      });
      res.cookie(cookieName, token, { ...cookieOptions, expires: expiresAt });
      res.json({ data: { csrfToken: csrf, expiresAt } });
    }),
  );
  app.use(
    "/api",
    asyncRoute(async (req, res, next) => {
      const token = req.cookies[cookieName];
      if (typeof token !== "string" || token.length > 128)
        throw new HttpError(401, "AUTHENTICATION_REQUIRED");
      const session = await db.userSession.findUnique({
        where: { tokenHash: hash(token) },
        include: {
          user: {
            include: {
              roles: {
                include: {
                  role: {
                    include: { permissions: { include: { permission: true } } },
                  },
                },
              },
            },
          },
        },
      });
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        !session.user.isActive
      )
        throw new HttpError(401, "SESSION_EXPIRED");
      const grants = new Set(
        session.user.roles.flatMap((r) =>
          r.role.permissions.map((p) => p.permission.code),
        ),
      );
      res.locals.identity = {
        userId: session.userId,
        sessionId: session.id,
        csrfTokenHash: session.csrfTokenHash,
        grants,
      } satisfies Identity;
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        if (req.get("origin") !== options.origin)
          throw new HttpError(403, "ORIGIN_REJECTED");
        const csrf = req.get("x-csrf-token");
        if (!csrf || !safeEqual(hash(csrf), session.csrfTokenHash))
          throw new HttpError(403, "CSRF_REJECTED");
      }
      next();
    }),
  );
  const identity = (res: Response) => res.locals.identity as Identity;
  const requirePermission =
    (code: string) => (_req: Request, res: Response, next: NextFunction) => {
      if (!identity(res).grants.has(code))
        return next(new HttpError(403, "PERMISSION_DENIED"));
      next();
    };
  app.get(
    "/api/auth/me",
    asyncRoute(async (_req, res) => {
      const id = identity(res);
      const user = await db.user.findUniqueOrThrow({
        where: { id: id.userId },
        select: { id: true, name: true, email: true },
      });
      res.json({ data: { ...user, permissions: [...id.grants] } });
    }),
  );
  app.get(
    "/api/auth/csrf",
    asyncRoute(async (req, res) => {
      if (
        req.get("sec-fetch-site") === "cross-site" ||
        (req.get("origin") && req.get("origin") !== options.origin)
      )
        throw new HttpError(403, "ORIGIN_REJECTED");
      const csrf = randomBytes(32).toString("base64url");
      await db.userSession.update({
        where: { id: identity(res).sessionId },
        data: { csrfTokenHash: hash(csrf) },
      });
      res.json({ data: { csrfToken: csrf } });
    }),
  );
  app.post(
    "/api/auth/logout",
    asyncRoute(async (_req, res) => {
      const id = identity(res);
      await db.$transaction(async (tx) => {
        await tx.userSession.update({
          where: { id: id.sessionId },
          data: { revokedAt: new Date() },
        });
        await audit(tx, id.userId, "AUTH_LOGOUT", id.userId);
      });
      res.clearCookie(cookieName, cookieOptions);
      res.status(204).end();
    }),
  );
  app.post(
    "/api/auth/password",
    loginLimit,
    asyncRoute(async (req, res) => {
      const body = z
        .object({
          currentPassword: z.string().max(256),
          newPassword: z.string().min(14).max(128),
        })
        .strict()
        .parse(req.body);
      const id = identity(res);
      const user = await db.user.findUniqueOrThrow({
        where: { id: id.userId },
      });
      if (!(await argon2.verify(user.passwordHash, body.currentPassword)))
        throw new HttpError(401, "INVALID_CREDENTIALS");
      const passwordHash = await argon2.hash(body.newPassword, {
        type: argon2.argon2id,
      });
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM User WHERE id=${id.userId} FOR UPDATE`;
        const current = await tx.user.findUniqueOrThrow({
          where: { id: id.userId },
        });
        if (current.passwordHash !== user.passwordHash)
          throw new HttpError(409, "ACCOUNT_CHANGED");
        await tx.user.update({
          where: { id: id.userId },
          data: { passwordHash },
        });
        await tx.userSession.updateMany({
          where: { userId: id.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await audit(tx, id.userId, "PASSWORD_CHANGED", id.userId, [
          "passwordHash",
        ]);
      });
      res.clearCookie(cookieName, cookieOptions);
      res.status(204).end();
    }),
  );
  app.use("/api", officerRoutes(db));
  app.use("/api", workbookReviewRoutes(db));
  app.use("/api", dashboardRoutes(db));
  app.use("/api", organizationRoutes(db));
  app.get(
    "/api/permissions",
    requirePermission("roles.manage"),
    asyncRoute(async (_req, res) =>
      res.json({
        data: await db.permission.findMany({ orderBy: { code: "asc" } }),
      }),
    ),
  );
  app.get(
    "/api/roles",
    requirePermission("roles.manage"),
    asyncRoute(async (_req, res) =>
      res.json({
        data: await db.role.findMany({
          include: { permissions: { include: { permission: true } } },
        }),
      }),
    ),
  );
  app.get(
    "/api/users",
    requirePermission("users.manage"),
    asyncRoute(async (_req, res) =>
      res.json({
        data: await db.user.findMany({
          take: 100,
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
            roles: { select: { roleId: true } },
          },
          orderBy: { id: "asc" },
        }),
      }),
    ),
  );
  app.post(
    "/api/users",
    requirePermission("users.manage"),
    asyncRoute(async (req, res) => {
      const body = z
        .object({
          name: z.string().min(1).max(191),
          email: z
            .string()
            .email()
            .max(191)
            .transform((x) => x.toLowerCase()),
          password: z.string().min(14).max(128),
        })
        .strict()
        .parse(req.body);
      const passwordHash = await argon2.hash(body.password, {
        type: argon2.argon2id,
      });
      const result = await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { name: body.name, email: body.email, passwordHash },
          select: { id: true, name: true, email: true },
        });
        await audit(tx, identity(res).userId, "USER_CREATED", user.id, [
          "name",
          "email",
        ]);
        return user;
      });
      res.status(201).json({ data: result });
    }),
  );
  app.patch(
    "/api/users/:id",
    requirePermission("users.manage"),
    asyncRoute(async (req, res) => {
      const body = z.object({ isActive: z.boolean() }).strict().parse(req.body);
      const id = z.string().parse(req.params.id);
      if (id === identity(res).userId)
        throw new HttpError(409, "SELF_DEACTIVATION_REJECTED");
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM User WHERE id=${id} FOR UPDATE`;
        await tx.user.update({ where: { id }, data: body });
        if (!body.isActive)
          await tx.userSession.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        await audit(tx, identity(res).userId, "USER_ACTIVITY_CHANGED", id, [
          "isActive",
        ]);
      });
      res.status(204).end();
    }),
  );
  app.put(
    "/api/users/:id/roles",
    requirePermission("roles.manage"),
    asyncRoute(async (req, res) => {
      const body = z
        .object({ roleIds: z.array(z.string().min(1)).max(30) })
        .strict()
        .parse(req.body);
      const id = z.string().parse(req.params.id);
      if (id === identity(res).userId)
        throw new HttpError(409, "SELF_ROLE_CHANGE_REJECTED");
      const roleIds = [...new Set(body.roleIds)];
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM User WHERE id=${id} FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id } });
        if (!user) throw new HttpError(404, "USER_NOT_FOUND");
        if (
          (await tx.role.count({ where: { id: { in: roleIds } } })) !==
          roleIds.length
        )
          throw new HttpError(422, "INVALID_ROLE");
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId: id, roleId })),
        });
        await tx.userSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await audit(tx, identity(res).userId, "USER_ROLES_CHANGED", id, [
          "roles",
        ]);
      });
      res.status(204).end();
    }),
  );
  app.put(
    "/api/roles/:id/permissions",
    requirePermission("roles.manage"),
    asyncRoute(async (req, res) => {
      const body = z
        .object({ permissionIds: z.array(z.string().min(1)).max(200) })
        .strict()
        .parse(req.body);
      const id = z.string().parse(req.params.id);
      const permissionIds = [...new Set(body.permissionIds)];
      await db.$transaction(async (tx) => {
        if (!(await tx.role.findUnique({ where: { id } })))
          throw new HttpError(404, "ROLE_NOT_FOUND");
        if (
          await tx.userRole.findFirst({
            where: { userId: identity(res).userId, roleId: id },
          })
        )
          throw new HttpError(409, "OWN_ROLE_CHANGE_REJECTED");
        if (
          (await tx.permission.count({
            where: { id: { in: permissionIds } },
          })) !== permissionIds.length
        )
          throw new HttpError(422, "INVALID_PERMISSION");
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: id,
            permissionId,
          })),
        });
        await audit(
          tx,
          identity(res).userId,
          "ROLE_PERMISSIONS_CHANGED",
          id,
          ["permissions"],
          "Role",
        );
      });
      res.status(204).end();
    }),
  );
  app.get(
    "/api/audit-logs",
    requirePermission("audit_logs.view"),
    asyncRoute(async (req, res) => {
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .default(1)
        .parse(req.query.page);
      res.json({
        data: await db.auditLog.findMany({
          skip: (page - 1) * 50,
          take: 50,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
      });
    }),
  );
  const frontendPath = path.resolve("frontend/dist");
  if (existsSync(path.join(frontendPath, "index.html"))) {
    app.use(express.static(frontendPath, { index: false }));
    app.get("/{*path}", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.set("Cache-Control", "no-store");
      res.sendFile(path.join(frontendPath, "index.html"));
    });
  }
  app.use((_req, _res, next) => next(new HttpError(404, "NOT_FOUND")));
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof HttpError)
        return res.status(error.status).json({ error: { code: error.code } });
      if (error instanceof ZodError)
        return res.status(422).json({
          error: {
            code: "VALIDATION_ERROR",
            fields: error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
        });
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002")
          return res.status(409).json({ error: { code: "DUPLICATE_RECORD" } });
        if (error.code === "P2025")
          return res.status(404).json({ error: { code: "NOT_FOUND" } });
      }
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        (error.status === 400 || error.status === 413)
      )
        return res
          .status(Number(error.status))
          .json({ error: { code: "INVALID_REQUEST_BODY" } });
      console.error(
        JSON.stringify({
          event: "request_failed",
          type:
            error instanceof Error ? error.constructor.name : "UnknownError",
        }),
      );
      return res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
    },
  );
  return app;
}
