import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/config/database.js";
import { createApp } from "../src/app.js";
import {
  officerTransaction,
  assertNoOverlap,
  verifiedDate,
} from "../src/services/history.js";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith("_test") ||
  process.env.NODE_ENV === "production"
)
  throw new Error("Explicit isolated TEST_DATABASE_URL ending _test required");
const db = createDatabase(url);
const prefix = "test-" + randomUUID();
const password = "Fictional-Testing-Only-2026!";
const origin = "http://localhost:3000";
let app: Awaited<ReturnType<typeof createApp>>,
  adminId: string,
  readerId: string,
  deniedId: string,
  roleId: string,
  officerId: string,
  unitId: string,
  rankId: string;
let admin: ReturnType<typeof request.agent>,
  reader: ReturnType<typeof request.agent>,
  csrf: string;
const login = (agent: ReturnType<typeof request.agent>, email: string) =>
  agent.post("/api/auth/login").set("Origin", origin).send({ email, password });
before(async () => {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  app = await createApp(db, { origin, production: false });
  const adminUser = await db.user.create({
    data: {
      name: "Fictional Admin",
      email: prefix + "-admin@example.invalid",
      passwordHash,
    },
  });
  adminId = adminUser.id;
  readerId = (
    await db.user.create({
      data: {
        name: "Fictional Reader",
        email: prefix + "-reader@example.invalid",
        passwordHash,
      },
    })
  ).id;
  deniedId = (
    await db.user.create({
      data: {
        name: "Fictional Denied",
        email: prefix + "-denied@example.invalid",
        passwordHash,
      },
    })
  ).id;
  const role = await db.role.create({ data: { name: prefix + "-admin" } });
  roleId = role.id;
  for (const code of [
    "officers.view",
    "users.manage",
    "roles.manage",
    "audit_logs.view",
    "fields.national_id.view",
  ]) {
    const permission = await db.permission.upsert({
      where: { code },
      create: { code, description: code },
      update: {},
    });
    await db.rolePermission.create({
      data: { roleId, permissionId: permission.id },
    });
  }
  await db.userRole.create({ data: { userId: adminId, roleId } });
  const readerRole = await db.role.create({
    data: { name: prefix + "-reader" },
  });
  const view = await db.permission.findUniqueOrThrow({
    where: { code: "officers.view" },
  });
  await db.rolePermission.create({
    data: { roleId: readerRole.id, permissionId: view.id },
  });
  await db.userRole.create({
    data: { userId: readerId, roleId: readerRole.id },
  });
  const o = await db.officer.create({
    data: {
      forceNumber: prefix,
      fullName: "Fictional Officer",
      nationalId: "FICTIONAL-PRIVATE-ID",
      phone: "FICTIONAL-PHONE",
      recordStatus: "UNVERIFIED",
    },
  });
  officerId = o.id;
  unitId = (
    await db.unit.create({ data: { code: prefix, name: "Fictional Unit" } })
  ).id;
  rankId = (
    await db.rank.create({
      data: { code: prefix, name: "Fictional Rank", hierarchyLevel: 999 },
    })
  ).id;
  admin = request.agent(app);
  reader = request.agent(app);
  csrf = (await login(admin, adminUser.email).expect(200)).body.data.csrfToken;
  await login(reader, prefix + "-reader@example.invalid").expect(200);
});
after(async () => {
  // Only remove this run's fictional fixtures; never truncate shared tables.
  await db.officerAssignment.deleteMany({ where: { officerId } });
  await db.officerRankHistory.deleteMany({ where: { officerId } });
  await db.officerStatusHistory.deleteMany({ where: { officerId } });
  await db.officer.deleteMany({ where: { id: officerId } });
  await db.unit.deleteMany({ where: { id: unitId } });
  await db.rank.deleteMany({ where: { id: rankId } });
  const users = await db.user.findMany({
    where: { email: { startsWith: prefix } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await db.auditLog.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { entityId: { in: ids } }] },
  });
  await db.userSession.deleteMany({ where: { userId: { in: ids } } });
  await db.userRole.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  const roles = await db.role.findMany({
    where: { name: { startsWith: prefix } },
    select: { id: true },
  });
  await db.rolePermission.deleteMany({
    where: { roleId: { in: roles.map((r) => r.id) } },
  });
  await db.role.deleteMany({ where: { id: { in: roles.map((r) => r.id) } } });
  await db.$disconnect();
});
test("health checks the database; anonymous requests are rejected", async () => {
  await request(app).get("/api/health").expect(200);
  await request(app).get("/api/officers").expect(401);
});
test("login validates origin and credentials without exposing users", async () => {
  await request(app)
    .post("/api/auth/login")
    .send({ email: "missing@example.invalid", password })
    .expect(403);
  await request(app)
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ email: prefix + "-admin@example.invalid", password: "wrong" })
    .expect(401);
});
test("sessions are hashed, HTTP-only and auditable; no password in identity", async () => {
  const response = await admin.get("/api/auth/me").expect(200);
  assert(!response.body.data.passwordHash);
  const session = await db.userSession.findFirstOrThrow({
    where: { userId: adminId },
  });
  assert.match(session.tokenHash, /^[a-f0-9]{64}$/);
  assert(
    await db.auditLog.count({
      where: { userId: adminId, action: "AUTH_LOGIN" },
    }),
  );
  const fresh = request.agent(app);
  const res = await login(fresh, prefix + "-admin@example.invalid").expect(200);
  const cookie = String(res.headers["set-cookie"]);
  assert(cookie.includes("HttpOnly"));
  assert(cookie.includes("SameSite=Strict"));
  await fresh
    .post("/api/auth/logout")
    .set("Origin", origin)
    .set("X-CSRF-Token", res.body.data.csrfToken)
    .expect(204);
  await fresh.get("/api/auth/me").expect(401);
});
test("backend RBAC and field projection hide sensitive values", async () => {
  await reader.get("/api/users").expect(403);
  const list = await reader
    .get("/api/officers")
    .query({ q: prefix })
    .expect(200);
  assert.equal(list.body.data.length, 1);
  assert(!("nationalId" in list.body.data[0]));
  assert(!("phone" in list.body.data[0]));
  assert(!("financialDetail" in list.body.data[0]));
  const allowed = await admin
    .get("/api/officers")
    .query({ q: prefix })
    .expect(200);
  assert.equal(allowed.body.data[0].nationalId, "FICTIONAL-PRIVATE-ID");
  const agent = request.agent(app);
  await login(agent, prefix + "-denied@example.invalid").expect(200);
  await agent.get("/api/officers").expect(403);
});
test("CSRF rejects missing token and cross-origin mutations; validated user creation is audited", async () => {
  const data = {
    name: "Fictional New User",
    email: prefix + "-new@example.invalid",
    password,
  };
  await admin.post("/api/users").set("Origin", origin).send(data).expect(403);
  await admin
    .post("/api/users")
    .set("Origin", "https://wrong.invalid")
    .set("X-CSRF-Token", csrf)
    .send(data)
    .expect(403);
  const r = await admin
    .post("/api/users")
    .set("Origin", origin)
    .set("X-CSRF-Token", csrf)
    .send(data)
    .expect(201);
  assert(!r.body.data.passwordHash);
  assert(
    await db.auditLog.count({
      where: { entityId: r.body.data.id, action: "USER_CREATED" },
    }),
  );
  await admin
    .post("/api/users")
    .set("Origin", origin)
    .set("X-CSRF-Token", csrf)
    .send(data)
    .expect(409);
  await admin
    .post("/api/users")
    .set("Origin", origin)
    .set("X-CSRF-Token", csrf)
    .send({ ...data, email: prefix + "-extra@example.invalid", isActive: true })
    .expect(422);
});
test("disabled users and expired sessions lose access immediately", async () => {
  const a = request.agent(app);
  await login(a, prefix + "-denied@example.invalid").expect(200);
  await db.user.update({ where: { id: deniedId }, data: { isActive: false } });
  await a.get("/api/auth/me").expect(401);
  await db.user.update({ where: { id: deniedId }, data: { isActive: true } });
  await login(a, prefix + "-denied@example.invalid").expect(200);
  await db.userSession.updateMany({
    where: { userId: deniedId },
    data: { expiresAt: new Date(0) },
  });
  await a.get("/api/auth/me").expect(401);
});
test("database prevents duplicate force numbers and orphan history", async () => {
  await assert.rejects(
    db.officer.create({
      data: { forceNumber: prefix, fullName: "Fictional Duplicate" },
    }),
  );
  await assert.rejects(
    db.officerRankHistory.create({
      data: {
        officerId: "missing",
        rankId,
        effectiveFrom: verifiedDate("2025-01-01"),
        datesVerifiedAt: new Date(),
        datesVerifiedById: adminId,
      },
    }),
  );
});
test("database and transaction helpers reject overlaps; adjacent verified histories remain valid", async () => {
  const verified = { datesVerifiedAt: new Date(), datesVerifiedById: adminId };
  const start = verifiedDate("2025-01-01"),
    end = verifiedDate("2026-01-01");
  await db.officerRankHistory.create({
    data: {
      officerId,
      rankId,
      effectiveFrom: start,
      effectiveTo: end,
      originalRankSpelling: "Fictional/Spec",
      specialistDesignation: "Fictional specialist",
      ...verified,
    },
  });
  await assert.rejects(
    db.officerRankHistory.create({
      data: {
        officerId,
        rankId,
        effectiveFrom: verifiedDate("2025-06-01"),
        ...verified,
      },
    }),
  );
  await db.officerRankHistory.create({
    data: { officerId, rankId, effectiveFrom: end, ...verified },
  });
  await officerTransaction(db, officerId, (tx) =>
    assert.rejects(
      assertNoOverlap(tx, "rank", officerId, {
        effectiveFrom: start,
        effectiveTo: null,
      }),
    ),
  );
  await assert.rejects(
    db.officerRankHistory.updateMany({
      where: { officerId, effectiveFrom: end },
      data: { effectiveFrom: start },
    }),
  );
  assert.equal(await db.officerRankHistory.count({ where: { officerId } }), 2);
  await assert.rejects(
    db.officerRankHistory.create({
      data: {
        officerId,
        rankId,
        effectiveFrom: verifiedDate("2027-01-01"),
        effectiveTo: verifiedDate("2026-01-01"),
        ...verified,
      },
    }),
  );
});
test("concurrent assignments serialize and only one overlapping primary assignment commits", async () => {
  const data = {
    officerId,
    unitId,
    effectiveFrom: verifiedDate("2026-01-01"),
    datesVerifiedAt: new Date(),
    datesVerifiedById: adminId,
  };
  const results = await Promise.allSettled([
    db.officerAssignment.create({ data }),
    db.officerAssignment.create({ data }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  await assert.rejects(
    db.officerAssignment.updateMany({
      where: { officerId },
      data: { effectiveTo: verifiedDate("2025-01-01") },
    }),
  );
});
test("status histories reject overlapping writes, enforce required verified dates, and restrict parent deletion", async () => {
  const data = {
    officerId,
    status: "FICTIONAL",
    effectiveFrom: verifiedDate("2026-01-01"),
    datesVerifiedAt: new Date(),
    datesVerifiedById: adminId,
  };
  await db.officerStatusHistory.create({ data });
  await assert.rejects(db.officerStatusHistory.create({ data }));
  await assert.rejects(db.officer.delete({ where: { id: officerId } }));
  await assert.rejects(
    db.$executeRaw`INSERT INTO OfficerStatusHistory (id,officerId,status,effectiveFrom,datesVerifiedById) VALUES (${randomUUID()},${officerId},'FICTIONAL','2030-01-01',${adminId})`,
  );
});
test("no production retirement or strength policy is active", async () => {
  assert.equal(await db.retirementRule.count({ where: { isActive: true } }), 0);
  assert.equal(
    await db.strengthInclusionRule.count({ where: { isActive: true } }),
    0,
  );
  await assert.rejects(
    db.retirementRule.create({
      data: {
        retirementAge: 60,
        effectiveFrom: verifiedDate("2026-01-01"),
        isActive: true,
      },
    }),
  );
});
test("all schema models, nullable columns and foreign keys match the migrated MySQL database", async () => {
  const { getDMMF } = await import("@prisma/internals");
  const { readFile } = await import("node:fs/promises");
  const { datamodel } = await getDMMF({
    datamodel: await readFile("backend/prisma/schema.prisma", "utf8"),
  });
  const { default: mariadb } = await import("mariadb");
  const { connectionOptions } = await import("../src/config/database.js");
  const meta = await mariadb.createConnection(connectionOptions(url!));
  const columns = await meta.query<
    { TABLE_NAME: string; COLUMN_NAME: string; IS_NULLABLE: string }[]
  >(
    "SELECT TABLE_NAME,COLUMN_NAME,IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE()",
  );
  const fks = await meta.query<
    {
      TABLE_NAME: string;
      COLUMN_NAME: string;
      REFERENCED_TABLE_NAME: string;
      REFERENCED_COLUMN_NAME: string;
    }[]
  >(
    "SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL",
  );
  await meta.end();
  for (const model of datamodel.models)
    for (const field of model.fields) {
      if (field.kind === "scalar") {
        const actual = columns.find(
          (c) => c.TABLE_NAME === model.name && c.COLUMN_NAME === field.name,
        );
        assert(actual, `${model.name}.${field.name} missing`);
        assert.equal(actual.IS_NULLABLE, field.isRequired ? "NO" : "YES");
      }
      if (field.relationFromFields?.length) {
        assert(
          fks.some(
            (f) =>
              f.TABLE_NAME === model.name &&
              f.COLUMN_NAME === field.relationFromFields![0] &&
              f.REFERENCED_TABLE_NAME === field.type &&
              f.REFERENCED_COLUMN_NAME === field.relationToFields?.[0],
          ),
          `${model.name}.${field.name} FK missing`,
        );
      }
    }
});
test("CSRF can be refreshed after reload, stale tokens fail, and role revocation takes effect", async () => {
  const token = (await admin.get("/api/auth/csrf").expect(200)).body.data
    .csrfToken;
  await admin
    .post("/api/users")
    .set("Origin", origin)
    .set("X-CSRF-Token", csrf)
    .send({})
    .expect(403);
  const role = (
    await db.userRole.findFirstOrThrow({ where: { userId: readerId } })
  ).roleId;
  await admin
    .put(`/api/users/${readerId}/roles`)
    .set("Origin", origin)
    .set("X-CSRF-Token", token)
    .send({ roleIds: [] })
    .expect(204);
  await reader.get("/api/auth/me").expect(401);
  await admin
    .put(`/api/roles/${roleId}/permissions`)
    .set("Origin", origin)
    .set("X-CSRF-Token", token)
    .send({ permissionIds: [] })
    .expect(409);
  assert(await db.role.findUnique({ where: { id: role } }));
});

test("unverified dates stay in staging; verified legacy movements can have no reference number", async () => {
  const batch = await db.importBatch.create({
    data: {
      filename: "fictional.xlsx",
      fileSha256: "fictional-test-only",
      uploadedById: adminId,
    },
  });
  const type = await db.movementType.create({
    data: { code: prefix, name: "Fictional Movement" },
  });
  try {
    const row = await db.importRow.create({
      data: {
        batchId: batch.id,
        sheetName: "CHANGES",
        rowNumber: 2,
        rawData: { rank: "Fictional/Spec" },
        unresolvedDates: { effectiveDate: "2026-??" },
        validationErrors: ["effective date needs verification"],
        originalRankSpelling: "Fictional/Spec",
        specialistDesignation: "Fictional specialist",
      },
    });
    assert.equal(row.verificationStatus, "UNVERIFIED");
    assert.equal(row.officerId, null);
    const movement = await db.personnelMovement.create({
      data: {
        officerId,
        movementTypeId: type.id,
        effectiveDate: verifiedDate("2026-01-01"),
        referenceNumber: null,
        recordedById: adminId,
        datesVerifiedAt: new Date(),
        datesVerifiedById: adminId,
        idempotencyKey: prefix,
      },
    });
    assert.equal(movement.referenceNumber, null);
    assert.equal(movement.appliedAt, null);
    assert.equal(movement.approvalStatus, "DRAFT");
    await assert.rejects(
      db.personnelMovement.create({
        data: {
          officerId,
          movementTypeId: type.id,
          effectiveDate: verifiedDate("2026-01-01"),
          recordedById: adminId,
          datesVerifiedAt: new Date(),
          datesVerifiedById: adminId,
          idempotencyKey: prefix,
        },
      }),
    );
  } finally {
    await db.personnelMovement.deleteMany({
      where: { movementTypeId: type.id },
    });
    await db.movementType.delete({ where: { id: type.id } });
    await db.importRow.deleteMany({ where: { batchId: batch.id } });
    await db.importBatch.delete({ where: { id: batch.id } });
  }
});

test("production authentication issues a Secure host-only HTTP-only cookie", async () => {
  const production = await createApp(db, {
    origin: "https://recce.example.invalid",
    production: true,
  });
  const response = await request(production)
    .post("/api/auth/login")
    .set("Origin", "https://recce.example.invalid")
    .send({ email: prefix + "-admin@example.invalid", password })
    .expect(200);
  const cookie = String(response.headers["set-cookie"]);
  assert(cookie.startsWith("__Host-recce_session="));
  assert(cookie.includes("Secure"));
  assert(cookie.includes("HttpOnly"));
  assert(cookie.includes("Path=/"));
  assert(!cookie.includes("Domain="));
});

test("unsafe isolation levels are rejected for direct history writes", async () => {
  await assert.rejects(
    db.$transaction(
      (tx) =>
        tx.officerStatusHistory.create({
          data: {
            officerId,
            status: "FICTIONAL",
            effectiveFrom: verifiedDate("2030-01-01"),
            datesVerifiedAt: new Date(),
            datesVerifiedById: adminId,
          },
        }),
      { isolationLevel: "RepeatableRead" },
    ),
  );
});

test("password changes require the current password and revoke existing sessions", async () => {
  const authApp = await createApp(db, { origin, production: false });
  const agent = request.agent(authApp);
  const email = prefix + "-reader@example.invalid";
  const res = await login(agent, email).expect(200);
  const token = res.body.data.csrfToken;
  await agent
    .post("/api/auth/password")
    .set("Origin", origin)
    .set("X-CSRF-Token", token)
    .send({
      currentPassword: "incorrect",
      newPassword: "Fictional-New-Password-2026!",
    })
    .expect(401);
  await agent
    .post("/api/auth/password")
    .set("Origin", origin)
    .set("X-CSRF-Token", token)
    .send({
      currentPassword: password,
      newPassword: "Fictional-New-Password-2026!",
    })
    .expect(204);
  await agent.get("/api/auth/me").expect(401);
  await login(request.agent(authApp), email).expect(401);
  await request(authApp)
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ email, password: "Fictional-New-Password-2026!" })
    .expect(200);
  assert(
    await db.auditLog.count({
      where: { userId: readerId, action: "PASSWORD_CHANGED" },
    }),
  );
});
