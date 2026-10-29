import "dotenv/config";
import { before, after, test } from "node:test";
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
  tag = "org-" + randomUUID(),
  origin = "http://localhost:3000",
  password = "Fictional-Organization-Test-2026!";
let app: Awaited<ReturnType<typeof createApp>>,
  admin: ReturnType<typeof request.agent>,
  reader: ReturnType<typeof request.agent>,
  csrf: string,
  readerCsrf: string,
  userId: string,
  rankId: string,
  secondRankId: string,
  unitId: string,
  childId: string,
  subId: string,
  officerId: string,
  assignmentId: string;
before(async () => {
  app = await createApp(db, { origin, production: false });
  const passwordHash = await argon2.hash(password);
  for (const suffix of ["admin", "reader"]) {
    const user = await db.user.create({
      data: {
        email: tag + suffix + "@example.invalid",
        name: "Fictional Organization " + suffix,
        passwordHash,
      },
    });
    const role = await db.role.create({ data: { name: tag + suffix } });
    for (const code of suffix === "admin"
      ? permissions
      : ["organization.view"]) {
      const permission = await db.permission.upsert({
        where: { code },
        create: { code, description: code },
        update: {},
      });
      await db.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }
    await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const agent = request.agent(app);
    const login = await agent
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: user.email, password })
      .expect(200);
    if (suffix === "admin") {
      admin = agent;
      csrf = login.body.data.csrfToken;
      userId = user.id;
    } else {
      reader = agent;
      readerCsrf = login.body.data.csrfToken;
    }
  }
  officerId = (
    await db.officer.create({
      data: {
        forceNumber: tag,
        fullName: "Fictional Organization Officer",
        recordStatus: "UNVERIFIED",
      },
    })
  ).id;
});
after(async () => {
  const officers = await db.officer.findMany({
      where: { forceNumber: { startsWith: tag } },
      select: { id: true },
    }),
    ids = officers.map((x) => x.id);
  const assignments = await db.officerAssignment.findMany({
    where: { officerId: { in: ids } },
    select: { id: true },
  });
  await db.deploymentRecord.deleteMany({
    where: { assignmentId: { in: assignments.map((x) => x.id) } },
  });
  await db.officerAssignment.deleteMany({ where: { officerId: { in: ids } } });
  await db.officer.deleteMany({ where: { id: { in: ids } } });
  const units = await db.unit.findMany({
      where: { code: { startsWith: tag } },
      select: { id: true },
    }),
    unitIds = units.map((x) => x.id);
  await db.rankEstablishment.deleteMany({ where: { unitId: { in: unitIds } } });
  await db.subUnit.deleteMany({ where: { unitId: { in: unitIds } } });
  await db.unit.updateMany({
    where: { id: { in: unitIds } },
    data: { parentUnitId: null },
  });
  await db.unit.deleteMany({ where: { id: { in: unitIds } } });
  const ranks = await db.rank.findMany({
    where: { code: { startsWith: tag } },
    select: { id: true },
  });
  await db.rankAlias.deleteMany({
    where: { rankId: { in: ranks.map((x) => x.id) } },
  });
  await db.rank.deleteMany({ where: { id: { in: ranks.map((x) => x.id) } } });
  const users = await db.user.findMany({
      where: { email: { startsWith: tag } },
      select: { id: true },
    }),
    userIds = users.map((x) => x.id);
  await db.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await db.userSession.deleteMany({ where: { userId: { in: userIds } } });
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  const roles = await db.role.findMany({
    where: { name: { startsWith: tag } },
    select: { id: true },
  });
  await db.rolePermission.deleteMany({
    where: { roleId: { in: roles.map((x) => x.id) } },
  });
  await db.role.deleteMany({ where: { id: { in: roles.map((x) => x.id) } } });
  await db.$disconnect();
});
const post = (path: string, body: object) =>
  admin
    .post("/api" + path)
    .set("Origin", origin)
    .set("X-CSRF-Token", csrf)
    .send(body);
const patch = (path: string, body: object) =>
  admin
    .patch("/api" + path)
    .set("Origin", origin)
    .set("X-CSRF-Token", csrf)
    .send(body);
const unitExpected = (u: {
  code: string;
  name: string;
  isActive: boolean;
  parentUnitId: string | null;
}) => ({
  expectedCode: u.code,
  expectedName: u.name,
  expectedIsActive: u.isActive,
  expectedParentUnitId: u.parentUnitId,
});
test("rank creation, aliases and stale editing preserve reviewed spellings", async () => {
  const rank = (
    await post("/ranks", {
      code: tag + "-r",
      name: "Fictional Rank",
      hierarchyLevel: 1,
    }).expect(201)
  ).body.data;
  rankId = rank.id;
  secondRankId = (
    await post("/ranks", {
      code: tag + "-r2",
      name: "Fictional Second Rank",
      hierarchyLevel: 2,
    }).expect(201)
  ).body.data.id;
  await post("/ranks", {
    code: tag + "-r",
    name: "Duplicate",
    hierarchyLevel: 3,
  }).expect(409);
  await post("/ranks/" + rankId + "/aliases", {
    alias: tag + "-legacy/Spec",
  }).expect(201);
  await post("/ranks/" + rankId + "/aliases", { alias: tag + "-r2" }).expect(
    409,
  );
  await patch("/ranks/" + rankId, {
    expectedUpdatedAt: rank.updatedAt,
    name: "Fictional Rank Updated",
  }).expect(200);
  await patch("/ranks/" + rankId, {
    expectedUpdatedAt: rank.updatedAt,
    name: "Stale edit",
  }).expect(409);
  const list = await admin.get("/api/ranks").query({ q: tag }).expect(200);
  assert.equal(list.body.meta.total, 2);
  assert.equal(
    list.body.data.find((x: { id: string }) => x.id === rankId).aliases[0]
      .alias,
    tag + "-legacy/Spec",
  );
});
test("unit hierarchy and sub-units reject cycles, duplicate codes and inactive parents", async () => {
  unitId = (
    await post("/units", {
      code: tag + "-root",
      name: "Fictional Root",
    }).expect(201)
  ).body.data.id;
  childId = (
    await post("/units", {
      code: tag + "-child",
      name: "Fictional Child",
      parentUnitId: unitId,
    }).expect(201)
  ).body.data.id;
  subId = (
    await post("/sub-units", {
      code: "TEST",
      name: "Fictional Sub-unit",
      unitId,
    }).expect(201)
  ).body.data.id;
  await post("/sub-units", { code: "TEST", name: "Duplicate", unitId }).expect(
    409,
  );
  const child = await db.unit.findUniqueOrThrow({ where: { id: childId } });
  await patch("/units/" + childId, {
    ...unitExpected(child),
    parentUnitId: childId,
  }).expect(422);
  const root = await db.unit.findUniqueOrThrow({ where: { id: unitId } });
  await patch("/units/" + unitId, {
    ...unitExpected(root),
    isActive: false,
  }).expect(409);
  const a = (
    await post("/units", {
      code: tag + "-a",
      name: "Fictional Concurrent A",
    }).expect(201)
  ).body.data;
  const b = (
    await post("/units", {
      code: tag + "-b",
      name: "Fictional Concurrent B",
    }).expect(201)
  ).body.data;
  const concurrent = await Promise.all([
    patch("/units/" + a.id, { ...unitExpected(a), parentUnitId: b.id }),
    patch("/units/" + b.id, { ...unitExpected(b), parentUnitId: a.id }),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  await post("/units", {
    code: tag + "-invalid",
    name: "Fictional Invalid",
    parentUnitId: "missing",
  }).expect(422);
});
test("organization viewing alone never grants mutations or personnel access", async () => {
  await reader.get("/api/units").expect(200);
  await reader
    .post("/api/units")
    .set("Origin", origin)
    .set("X-CSRF-Token", readerCsrf)
    .send({ code: "DENIED", name: "Denied" })
    .expect(403);
  await reader.get("/api/assignments").expect(403);
  await reader.get("/api/deployments").expect(403);
  await reader.get("/api/establishments").expect(403);
  await request(app).get("/api/units").expect(401);
});
test("first assignment baseline is verified and cannot bypass later movement approvals", async () => {
  await post("/assignments", {
    officerId,
    unitId,
    subUnitId: subId,
    effectiveFrom: "2025-01-01",
    datesVerified: false,
  }).expect(422);
  const assignment = (
    await post("/assignments", {
      officerId,
      unitId,
      subUnitId: subId,
      effectiveFrom: "2025-01-01",
      datesVerified: true,
    }).expect(201)
  ).body.data;
  assignmentId = assignment.id;
  assert.equal(assignment.datesVerifiedById, userId);
  await post("/assignments", {
    officerId,
    unitId,
    effectiveFrom: "2026-01-01",
    datesVerified: true,
  }).expect(409);
  assert.equal(await db.officerAssignment.count({ where: { officerId } }), 1);
  assert.equal(await db.personnelMovement.count({ where: { officerId } }), 0);
});
test("deployment intervals reject overlaps, invalid bounds and incomplete dates", async () => {
  await post("/deployments", {
    assignmentId,
    deploymentStatus: "FICTIONAL_IN_CAMP",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2025-06-01",
    datesVerified: true,
  }).expect(201);
  await post("/deployments", {
    assignmentId,
    deploymentStatus: "FICTIONAL_DETACHED",
    effectiveFrom: "2025-03-01",
    effectiveTo: "2025-07-01",
    datesVerified: true,
  }).expect(409);
  await post("/deployments", {
    assignmentId,
    deploymentStatus: "FICTIONAL",
    effectiveFrom: "2024-01-01",
    effectiveTo: "2025-01-01",
    datesVerified: true,
  }).expect(422);
  await post("/deployments", {
    assignmentId,
    deploymentStatus: "FICTIONAL",
    effectiveFrom: "2025-??",
    datesVerified: true,
  }).expect(422);
  const deployment = (
    await post("/deployments", {
      assignmentId,
      deploymentStatus: "FICTIONAL_DETACHED",
      locationLabel: "Fictional location",
      effectiveFrom: "2025-06-01",
      datesVerified: true,
    }).expect(201)
  ).body.data;
  await post("/deployments/" + deployment.id + "/close", {
    effectiveTo: "2025-10-01",
    expectedVerifiedAt: deployment.datesVerifiedAt,
    datesVerified: true,
  }).expect(204);
  await post("/deployments/" + deployment.id + "/close", {
    effectiveTo: "2025-11-01",
    expectedVerifiedAt: deployment.datesVerifiedAt,
    datesVerified: true,
  }).expect(409);
  await assert.rejects(
    db.officerAssignment.update({
      where: { id: assignmentId },
      data: { effectiveTo: new Date("2025-03-01") },
    }),
  );
  const old = (
    await admin
      .get("/api/deployments")
      .query({ q: tag, asOf: "2025-02-01" })
      .expect(200)
  ).body.data;
  assert.equal(old.length, 1);
  assert.equal(old[0].deploymentStatus, "FICTIONAL_IN_CAMP");
  const later = (
    await admin
      .get("/api/deployments")
      .query({ q: tag, asOf: "2025-07-01" })
      .expect(200)
  ).body.data;
  assert.equal(later[0].deploymentStatus, "FICTIONAL_DETACHED");
});
test("approved establishments require explicit approval and preserve dated staffing history", async () => {
  const data = {
    unitId,
    subUnitId: subId,
    rankId,
    authorizedStrength: 10,
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    datesVerified: true,
  };
  await post("/establishments", { ...data, approvalConfirmed: false }).expect(
    422,
  );
  await post("/establishments", {
    ...data,
    authorizedStrength: -1,
    approvalConfirmed: true,
  }).expect(422);
  await post("/establishments", { ...data, approvalConfirmed: true }).expect(
    201,
  );
  await post("/establishments", {
    ...data,
    authorizedStrength: 20,
    approvalConfirmed: true,
  }).expect(409);
  const next = (
    await post("/establishments", {
      ...data,
      authorizedStrength: 20,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      approvalConfirmed: true,
    }).expect(201)
  ).body.data;
  await post("/establishments/" + next.id + "/close", {
    effectiveTo: "2027-01-01",
    expectedVerifiedAt: next.datesVerifiedAt,
    datesVerified: true,
  }).expect(204);
  const previous = (
    await admin
      .get("/api/establishments")
      .query({ unitId, asOf: "2025-06-01" })
      .expect(200)
  ).body.data;
  assert.equal(previous.length, 1);
  assert.equal(previous[0].authorizedStrength, 10);
  const current = (
    await admin
      .get("/api/establishments")
      .query({ unitId, asOf: "2026-06-01" })
      .expect(200)
  ).body.data;
  assert.equal(current[0].authorizedStrength, 20);
  assert.equal(
    (
      await admin
        .get("/api/establishments")
        .query({ unitId, asOf: "2027-01-01" })
        .expect(200)
    ).body.data.length,
    0,
  );
});
test("concurrent establishment entries serialize and direct SQL cannot rewrite or overlap history", async () => {
  const data = {
    unitId,
    rankId: secondRankId,
    authorizedStrength: 5,
    effectiveFrom: "2025-01-01",
    datesVerified: true,
    approvalConfirmed: true,
  };
  const results = await Promise.all([
    post("/establishments", data),
    post("/establishments", data),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const establishment = await db.rankEstablishment.findFirstOrThrow({
    where: { unitId, rankId },
  });
  await assert.rejects(
    db.rankEstablishment.update({
      where: { id: establishment.id },
      data: { authorizedStrength: 99 },
    }),
  );
  await assert.rejects(
    db.deploymentRecord.create({
      data: {
        assignmentId,
        deploymentStatus: "FICTIONAL_DUPLICATE",
        effectiveFrom: new Date("2025-02-01"),
        effectiveTo: new Date("2025-03-01"),
        datesVerifiedAt: new Date(),
        datesVerifiedById: userId,
      },
    }),
  );
});
test("deactivation preserves references and prevents new assignment selection", async () => {
  const rank = await db.rank.findUniqueOrThrow({ where: { id: rankId } });
  await patch("/ranks/" + rankId, {
    expectedUpdatedAt: rank.updatedAt.toISOString(),
    code: tag + "-changed",
  }).expect(409);
  const root = await db.unit.findUniqueOrThrow({ where: { id: unitId } });
  await patch("/units/" + unitId, {
    ...unitExpected(root),
    parentUnitId: childId,
  }).expect(409);
  const sub = await db.subUnit.findUniqueOrThrow({ where: { id: subId } });
  await patch("/sub-units/" + subId, {
    expectedCode: sub.code,
    expectedName: sub.name,
    expectedIsActive: sub.isActive,
    isActive: false,
  }).expect(200);
  const child = await db.unit.findUniqueOrThrow({ where: { id: childId } });
  await patch("/units/" + childId, {
    ...unitExpected(child),
    isActive: false,
  }).expect(200);
  await patch("/units/" + unitId, {
    ...unitExpected(root),
    isActive: false,
  }).expect(200);
  await post("/sub-units", { unitId, code: "NEW", name: "Blocked" }).expect(
    422,
  );
  const options = (await admin.get("/api/organization/options").expect(200))
    .body.data;
  assert(!options.units.some((u: { id: string }) => u.id === unitId));
  assert.equal(
    (await admin.get("/api/assignments").query({ q: tag }).expect(200)).body
      .meta.total,
    1,
  );
});
test("organization edits and verified records are audited without locations or officer names", async () => {
  const logs = await db.auditLog.findMany({ where: { userId } });
  for (const action of [
    "RANK_CREATED",
    "RANK_ALIAS_CREATED",
    "UNIT_CREATED",
    "SUB_UNIT_CREATED",
    "ASSIGNMENT_BASELINE_CREATED",
    "DEPLOYMENT_RECORDED",
    "APPROVED_ESTABLISHMENT_RECORDED",
    "VERIFIED_INTERVAL_CLOSED",
  ])
    assert(logs.some((l) => l.action === action));
  const serialized = JSON.stringify(logs);
  assert(!serialized.includes("Fictional location"));
  assert(!serialized.includes("Fictional Organization Officer"));
  assert.equal(
    await db.strengthInclusionRule.count({ where: { isActive: true } }),
    0,
  );
  assert.equal(await db.retirementRule.count({ where: { isActive: true } }), 0);
});
