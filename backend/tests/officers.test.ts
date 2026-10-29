import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/config/database.js";
import { createApp } from "../src/app.js";
import { permissions } from "../src/config/permissions.js";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith("_test") ||
  process.env.NODE_ENV === "production"
)
  throw Error("Dedicated test database required");
const db = createDatabase(url),
  tag = "phase3-" + randomUUID(),
  password = "Fictional-Phase3-Password!";
const origin = "http://localhost:3000";
let app: Awaited<ReturnType<typeof createApp>>,
  admin: ReturnType<typeof request.agent>,
  reader: ReturnType<typeof request.agent>,
  csrf: string,
  readerCsrf: string,
  adminId: string,
  rankId: string,
  unitId: string,
  countyId: string,
  roleId: string;
let officerId: string;
before(async () => {
  app = await createApp(db, { origin, production: false });
  const passwordHash = await argon2.hash(password);
  const user = await db.user.create({
    data: {
      email: tag + "@example.invalid",
      name: "Fictional Phase 3 Admin",
      passwordHash,
    },
  });
  adminId = user.id;
  const role = await db.role.create({ data: { name: tag } });
  roleId = role.id;
  for (const code of permissions) {
    const p = await db.permission.upsert({
      where: { code },
      create: { code, description: code },
      update: {},
    });
    await db.rolePermission.create({ data: { roleId, permissionId: p.id } });
  }
  await db.userRole.create({ data: { userId: user.id, roleId } });
  const readonly = await db.user.create({
    data: {
      email: tag + "-reader@example.invalid",
      name: "Fictional Limited User",
      passwordHash,
    },
  });
  const readRole = await db.role.create({ data: { name: tag + "-reader" } });
  for (const code of ["officers.view", "officers.create", "officers.update"]) {
    const p = await db.permission.findUniqueOrThrow({ where: { code } });
    await db.rolePermission.create({
      data: { roleId: readRole.id, permissionId: p.id },
    });
  }
  await db.userRole.create({
    data: { userId: readonly.id, roleId: readRole.id },
  });
  rankId = (
    await db.rank.create({
      data: { code: tag, name: "Fictional Rank", hierarchyLevel: 99 },
    })
  ).id;
  unitId = (
    await db.unit.create({ data: { code: tag, name: "Fictional Unit" } })
  ).id;
  countyId = (await db.county.create({ data: { name: tag } })).id;
  admin = request.agent(app);
  reader = request.agent(app);
  csrf = (
    await admin
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: user.email, password })
      .expect(200)
  ).body.data.csrfToken;
  readerCsrf = (
    await reader
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: readonly.email, password })
      .expect(200)
  ).body.data.csrfToken;
});
after(async () => {
  const officers = await db.officer.findMany({
    where: { forceNumber: { startsWith: tag } },
    select: { id: true },
  });
  const ids = officers.map((o) => o.id);
  await db.officerRankHistory.deleteMany({ where: { officerId: { in: ids } } });
  await db.officerAssignment.deleteMany({ where: { officerId: { in: ids } } });
  await db.officerServiceProfile.deleteMany({
    where: { officerId: { in: ids } },
  });
  await db.officerEducation.deleteMany({ where: { officerId: { in: ids } } });
  await db.officer.deleteMany({ where: { id: { in: ids } } });
  await db.rank.delete({ where: { id: rankId } });
  await db.unit.delete({ where: { id: unitId } });
  await db.county.delete({ where: { id: countyId } });
  const users = await db.user.findMany({
    where: { email: { startsWith: tag } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  await db.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await db.userSession.deleteMany({ where: { userId: { in: userIds } } });
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  const roles = await db.role.findMany({
    where: { name: { startsWith: tag } },
    select: { id: true },
  });
  await db.rolePermission.deleteMany({
    where: { roleId: { in: roles.map((r) => r.id) } },
  });
  await db.role.deleteMany({ where: { id: { in: roles.map((r) => r.id) } } });
  await db.$disconnect();
});
const post = (path: string, body: object) =>
  admin.post(path).set("Origin", origin).set("X-CSRF-Token", csrf).send(body);
const patch = (id: string, body: object) =>
  admin
    .patch("/api/officers/" + id)
    .set("Origin", origin)
    .set("X-CSRF-Token", csrf)
    .send(body);
async function current() {
  return (await admin.get("/api/officers/" + officerId).expect(200)).body.data;
}
test("registration preserves string identifiers and creates verified initial history transactionally", async () => {
  const res = await post("/api/officers", {
    forceNumber: tag,
    fullName: "Fictional Officer Alpha",
    nationalId: "00000123",
    payrollNumber: "0000456",
    countyId,
    dateOfBirth: "1990-02-28",
    dateEnlisted: "2010-01-01",
    serviceProfile: {
      dateJoinedUnit: "2015-01-01",
      serviceRemarks: "Fictional service note",
    },
    initialRank: {
      rankId,
      effectiveFrom: "2025-01-01",
      datesVerified: true,
      originalRankSpelling: "Fictional/Spec",
      specialistDesignation: "Fictional specialist",
    },
    initialAssignment: {
      unitId,
      effectiveFrom: "2025-01-01",
      datesVerified: true,
    },
    education: {
      educationLevel: "Fictional degree",
      institution: "Fictional Institute",
    },
  }).expect(201);
  officerId = res.body.data.id;
  assert.equal(res.body.data.nationalId, "00000123");
  assert.equal(res.body.data.payrollNumber, "0000456");
  assert.equal(res.body.data.recordStatus, "UNVERIFIED");
  assert.equal(await db.officerRankHistory.count({ where: { officerId } }), 1);
  assert.equal(await db.officerAssignment.count({ where: { officerId } }), 1);
  assert.equal(
    await db.officerStatusHistory.count({ where: { officerId } }),
    0,
  );
});
test("duplicate force numbers, unknown fields and unverified or partial dates are rejected", async () => {
  await post("/api/officers", {
    forceNumber: tag,
    fullName: "Duplicate",
  }).expect(409);
  await post("/api/officers", {
    forceNumber: tag + "bad",
    fullName: "Fictional",
    recordStatus: "ACTIVE",
  }).expect(422);
  await post("/api/officers", {
    forceNumber: tag + "bad",
    fullName: "Fictional",
    initialRank: { rankId, effectiveFrom: "2025-01", datesVerified: true },
  }).expect(422);
  await post("/api/officers", {
    forceNumber: tag + "bad",
    fullName: "Fictional",
    initialRank: { rankId, effectiveFrom: "2025-01-01", datesVerified: false },
  }).expect(422);
  assert.equal(
    await db.officer.count({ where: { forceNumber: tag + "bad" } }),
    0,
  );
});
test("field-write permissions are enforced even for users allowed to create and update officers", async () => {
  await reader
    .post("/api/officers")
    .set("Origin", origin)
    .set("X-CSRF-Token", readerCsrf)
    .send({
      forceNumber: tag + "denied",
      fullName: "Fictional Unauthorized",
      nationalId: "private",
    })
    .expect(403);
  const o = await current();
  await reader
    .patch("/api/officers/" + officerId)
    .set("Origin", origin)
    .set("X-CSRF-Token", readerCsrf)
    .send({ version: o.version, phone: "private" })
    .expect(403);
  await reader
    .get("/api/officers/" + officerId + "/sections/service")
    .expect(403);
  const response = await reader.get("/api/officers/" + officerId).expect(200);
  assert(!("nationalId" in response.body.data));
  assert(!("dateEnlisted" in response.body.data));
  await reader.get("/api/officers").query({ rankId }).expect(403);
});
test("editing updates permitted fields and rejects stale versions without changing history", async () => {
  const o = await current();
  await patch(officerId, {
    version: o.version,
    fullName: "Fictional Officer Updated",
    phone: "000-TEST",
  }).expect(200);
  await patch(officerId, { version: o.version, fullName: "Lost edit" }).expect(
    409,
  );
  assert.equal((await current()).fullName, "Fictional Officer Updated");
  assert.equal(await db.officerRankHistory.count({ where: { officerId } }), 1);
  const newVersion = (await current()).version;
  await patch(officerId, {
    version: newVersion,
    dateEnlisted: "1989-01-01",
  }).expect(422);
  assert.equal((await current()).version, newVersion);
});
test("filters, pagination, sorting and authorized profile histories return accurate records", async () => {
  const list = await admin
    .get("/api/officers")
    .query({
      q: tag,
      rankId,
      pageSize: 1,
      sort: "forceNumber",
      direction: "desc",
    })
    .expect(200);
  assert.equal(list.body.meta.total, 1);
  assert.equal(list.body.data[0].id, officerId);
  await admin.get("/api/officers").query({ sort: "nationalId" }).expect(422);
  const history = await admin
    .get("/api/officers/" + officerId + "/sections/ranks")
    .expect(200);
  assert.equal(history.body.data[0].originalRankSpelling, "Fictional/Spec");
  assert(!JSON.stringify(history.body).includes(password));
});
test("archive and restore preserve service status and history, with revision and permission checks", async () => {
  const before = await current();
  await reader
    .delete("/api/officers/" + officerId)
    .set("Origin", origin)
    .set("X-CSRF-Token", readerCsrf)
    .send({ version: before.version })
    .expect(403);
  await admin
    .delete("/api/officers/" + officerId)
    .set("Origin", origin)
    .set("X-CSRF-Token", csrf)
    .send({ version: before.version })
    .expect(204);
  const archived = await current();
  assert(archived.deletedAt);
  assert.equal(archived.recordStatus, before.recordStatus);
  assert.equal(
    (await admin.get("/api/officers").query({ q: tag }).expect(200)).body.meta
      .total,
    0,
  );
  assert.equal(
    (
      await admin
        .get("/api/officers")
        .query({ q: tag, archive: "archived" })
        .expect(200)
    ).body.meta.total,
    1,
  );
  await patch(officerId, {
    version: archived.version,
    fullName: "Should fail",
  }).expect(409);
  await post("/api/officers/" + officerId + "/restore", {
    version: before.version,
  }).expect(409);
  await post("/api/officers/" + officerId + "/restore", {
    version: archived.version,
  }).expect(204);
  assert.equal((await current()).deletedAt, null);
  assert.equal(await db.officerAssignment.count({ where: { officerId } }), 1);
});
test("bulk archive is atomic when one revision is stale", async () => {
  const other = (
    await post("/api/officers", {
      forceNumber: tag + "-bulk",
      fullName: "Fictional Bulk Officer",
    }).expect(201)
  ).body.data;
  const o = await current();
  await post("/api/officers/bulk-archive", {
    officers: [
      { id: other.id, version: other.version },
      { id: officerId, version: o.version + 1 },
    ],
  }).expect(409);
  assert.equal(
    (await db.officer.findUniqueOrThrow({ where: { id: other.id } })).deletedAt,
    null,
  );
  assert.equal((await current()).deletedAt, null);
  await post("/api/officers/bulk-archive", {
    officers: [
      { id: other.id, version: other.version },
      { id: officerId, version: o.version },
    ],
  }).expect(204);
  assert(
    (await db.officer.findUniqueOrThrow({ where: { id: other.id } })).deletedAt,
  );
  assert((await current()).deletedAt);
});
test("audit logs record changed field names without sensitive values", async () => {
  const logs = await db.auditLog.findMany({ where: { entityId: officerId } });
  assert(logs.some((l) => l.action === "OFFICER_CREATED"));
  assert(logs.some((l) => l.action === "OFFICER_UPDATED"));
  assert(logs.some((l) => l.action === "OFFICER_ARCHIVED"));
  assert(logs.some((l) => l.action === "OFFICER_RESTORED"));
  const serialized = JSON.stringify(logs);
  for (const secret of ["00000123", "000-TEST", "Fictional Officer Updated"])
    assert(!serialized.includes(secret));
});
