import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import argon2 from "argon2";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createDatabase } from "../src/config/database.js";
import { createApp } from "../src/app.js";
import { permissions } from "../src/config/permissions.js";
import { seal } from "../../tools/workbook-import-data.cjs";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith("_test") ||
  process.env.NODE_ENV === "production"
)
  throw new Error("Dedicated test database required");
const db = createDatabase(url),
  tag = "change-" + randomUUID(),
  origin = "http://localhost:3000",
  password = "Fictional-Change-Password-2026!";
test("CHANGES keeps A–AL, requires an existing officer, isolates years, supports CRUD and atomically applies independently approved histories", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "recce-changes-")),
    oldKey = process.env.WORKBOOK_IMPORT_KEY_PATH;
  process.env.WORKBOOK_IMPORT_KEY_PATH = path.join(dir, "source.key");
  const key = randomBytes(32);
  await writeFile(process.env.WORKBOOK_IMPORT_KEY_PATH, key, { mode: 0o600 });
  let adminId = "",
    reviewerId = "",
    roleId = "",
    officerId = "",
    batchId = "",
    unitId = "",
    otherUnitId = "",
    oldSubId = "",
    newSubId = "",
    pcId = "",
    ciId = "";
  const approverRoleExisted = !!(await db.role.findUnique({
    where: { name: "Personnel Change Approver" },
  }));
  const year = Number(
      new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        timeZone: "Africa/Nairobi",
      }).format(new Date()),
    ),
    past = year - 1;
  try {
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
    const admin = await db.user.create({
      data: {
        name: "Fictional Changes Recorder",
        email: tag + "@example.invalid",
        passwordHash: await argon2.hash(password),
        roles: { create: { roleId } },
      },
    });
    adminId = admin.id;
    const app = await createApp(db, { origin, production: false }),
      maker = request.agent(app),
      reviewer = request.agent(app);
    const login = await maker
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: admin.email, password });
    assert.equal(login.status, 200);
    const csrf = login.body.data.csrfToken;
    const post = (route: string, body: any) =>
      maker
        .post(route)
        .set("Origin", origin)
        .set("X-CSRF-Token", csrf)
        .send(body);
    const patch = (id: string, body: any) =>
      maker
        .patch("/api/changes/" + id)
        .set("Origin", origin)
        .set("X-CSRF-Token", csrf)
        .send(body);
    const remove = (id: string, revision: number) =>
      maker
        .delete("/api/changes/" + id)
        .set("Origin", origin)
        .set("X-CSRF-Token", csrf)
        .send({ revision });
    const approver = await post("/api/changes/approvers", {
      name: "Fictional Changes Approver",
      email: tag + "-reviewer@example.invalid",
      password,
    });
    assert.equal(approver.status, 201);
    reviewerId = approver.body.data.id;
    const reviewerLogin = await reviewer
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: tag + "-reviewer@example.invalid", password });
    assert.equal(reviewerLogin.status, 200);
    const approve = (id: string, revision: number) =>
      reviewer
        .post("/api/changes/" + id + "/approve")
        .set("Origin", origin)
        .set("X-CSRF-Token", reviewerLogin.body.data.csrfToken)
        .send({ revision, datesVerified: true });
    const options = await maker.get("/api/changes/options");
    assert.equal(options.status, 200);
    for (const t of options.body.data.types) {
      assert.equal(t.columns.length, 38);
      assert.equal(t.columns[6].label, "Sub-unit");
      assert.equal(t.columns[37].letter, "AL");
    }
    unitId = (
      await db.unit.create({ data: { code: tag, name: "Fictional formation" } })
    ).id;
    otherUnitId = (
      await db.unit.create({
        data: { code: tag + "-other", name: "Fictional other unit" },
      })
    ).id;
    oldSubId = (
      await db.subUnit.create({
        data: { unitId, code: "HQS", name: "Fictional HQS" },
      })
    ).id;
    newSubId = (
      await db.subUnit.create({
        data: { unitId, code: "RRT", name: "Fictional RRT" },
      })
    ).id;
    pcId = (
      await db.rank.create({
        data: { code: tag + "-PC", name: "Fictional PC", hierarchyLevel: 13 },
      })
    ).id;
    ciId = (
      await db.rank.create({
        data: { code: tag + "-CI", name: "Fictional CI", hierarchyLevel: 7 },
      })
    ).id;
    const officer = await db.officer.create({
      data: {
        forceNumber: tag,
        fullName: "Fictional Changes Officer",
        recordStatus: "ACTIVE",
      },
    });
    officerId = officer.id;
    await db.officerAssignment.create({
      data: {
        officerId,
        unitId,
        subUnitId: oldSubId,
        effectiveFrom: new Date(`${past - 1}-01-01T00:00:00Z`),
        datesVerifiedAt: new Date(),
        datesVerifiedById: adminId,
      },
    });
    await db.officerRankHistory.create({
      data: {
        officerId,
        rankId: pcId,
        effectiveFrom: new Date(`${past - 1}-01-01T00:00:00Z`),
        datesVerifiedAt: new Date(),
        datesVerifiedById: adminId,
      },
    });
    await db.officerStatusHistory.create({
      data: {
        officerId,
        status: "ACTIVE",
        effectiveFrom: new Date(`${past - 1}-01-01T00:00:00Z`),
        datesVerifiedAt: new Date(),
        datesVerifiedById: adminId,
      },
    });
    const directRoster = await maker.get("/api/organization/groups?group=HQS");
    assert.equal(directRoster.status, 200);
    assert.equal(directRoster.body.meta.total, 1);
    const directReport = await maker.get("/api/dashboard");
    assert.equal(directReport.status, 200);
    assert.equal(directReport.body.data.sourceLinked, 1);
    const batch = await db.importBatch.create({
      data: {
        filename: "Fictional CHANGES",
        fileSha256: tag,
        uploadedById: adminId,
        status: "CORE_IMPORTED_REVIEW_PENDING",
        totalRows: 2,
        importedRows: 1,
      },
    });
    batchId = batch.id;
    await db.importRow.create({
      data: {
        batchId,
        sheetName: "NAMES",
        rowNumber: 2,
        officerId,
        rawData: seal(
          { 2: tag, 5: "PC", 6: officer.fullName, 20: "HQS", 22: "R" },
          key,
          `${tag}:NAMES:2`,
        ),
        unresolvedDates: {},
        validationErrors: [],
      },
    });
    const cells = Object.fromEntries(
      Array.from({ length: 38 }, (_, i) => [
        String(i + 1),
        "Fictional column " + (i + 1),
      ]),
    );
    cells["2"] = tag;
    cells["5"] = officer.fullName;
    cells["7"] = "HQS";
    cells["10"] = `${year}-04-01`;
    cells["15"] = `${year}-04-02`;
    cells["38"] = "FICTIONAL_LAST_COLUMN";
    const source = await db.importRow.create({
      data: {
        batchId,
        sheetName: "CHANGES",
        rowNumber: 6,
        rawData: seal(cells, key, `${tag}:CHANGES:6`),
        unresolvedDates: {},
        validationErrors: [],
      },
    });
    const body = {
      officerId,
      eventType: "TRANSFER_OUT",
      effectiveDate: `${past}-07-01`,
      cells,
    };
    assert.equal(
      (await post("/api/changes", { ...body, officerId: "missing-officer" }))
        .status,
      404,
    );
    assert.equal(
      (
        await post("/api/changes", {
          ...body,
          cells: { ...cells, "2": "wrong-officer" },
        })
      ).status,
      409,
    );
    const created = await post("/api/changes", {
      ...body,
      sourceImportRowId: source.id,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    let list = await maker.get("/api/changes?year=" + past);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(Object.keys(list.body.data[0].cells).length, 38);
    assert.equal(list.body.data[0].cells["38"], "FICTIONAL_LAST_COLUMN");
    assert(
      !JSON.stringify(
        (await db.officerChange.findUniqueOrThrow({ where: { id } }))
          .workbookCells,
      ).includes("FICTIONAL_LAST_COLUMN"),
    );
    assert.equal(
      (await maker.get("/api/changes?year=" + year)).body.data.length,
      0,
    ); // letter dates are not event dates
    const undated = await post("/api/changes", {
      ...body,
      effectiveDate: null,
      eventType: "SUSPENSION",
    });
    assert.equal(undated.status, 201);
    assert.equal(
      (await maker.get("/api/changes?year=undated")).body.data.length,
      1,
    );
    assert.equal(
      (
        await post("/api/changes/" + undated.body.data.id + "/submit", {
          revision: 0,
        })
      ).status,
      422,
    );
    assert.equal((await remove(undated.body.data.id, 0)).status, 204);
    const movingYear = await post("/api/changes", {
      ...body,
      effectiveDate: `${year}-06-01`,
    });
    assert.equal(movingYear.status, 201);
    const moved = await patch(movingYear.body.data.id, {
      ...body,
      revision: 0,
      effectiveDate: `${past}-06-01`,
    });
    assert.equal(moved.status, 200);
    assert(
      (await maker.get("/api/changes?year=" + past)).body.data.some(
        (row: any) => row.id === movingYear.body.data.id,
      ),
    );
    assert(
      !(await maker.get("/api/changes?year=" + year)).body.data.some(
        (row: any) => row.id === movingYear.body.data.id,
      ),
    );
    assert.equal((await remove(movingYear.body.data.id, 1)).status, 204);
    assert.equal(
      (await post("/api/changes", { ...body, approvalStatus: "APPLIED" }))
        .status,
      422,
    );
    assert.equal(
      (
        await post("/api/changes", {
          ...body,
          cells: { ...cells, "39": "NOT_A_WORKBOOK_COLUMN" },
        })
      ).status,
      422,
    );
    const revised = {
      ...body,
      cells: { ...cells, "38": "FICTIONAL_EDITED_LAST_COLUMN" },
      revision: 0,
    };
    assert.equal((await patch(id, revised)).status, 200);
    assert.equal((await patch(id, revised)).status, 409);
    assert.equal(
      (await post("/api/changes/" + id + "/submit", { revision: 1 })).status,
      200,
    );
    assert.equal((await remove(id, 2)).status, 409);
    assert.equal(
      (
        await post("/api/changes/" + id + "/approve", {
          revision: 2,
          datesVerified: true,
        })
      ).status,
      403,
    );
    const applied = await approve(id, 2);
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.equal(applied.body.data.status, "APPLIED");
    assert.equal((await approve(id, 2)).status, 200);
    assert.equal(await db.personnelMovement.count({ where: { officerId } }), 1);
    const left = await db.officer.findUniqueOrThrow({
      where: { id: officerId },
    });
    assert.equal(left.recordStatus, "TRANSFERRED_OUT");
    assert.equal(left.deletedAt, null);
    const oldAssignment = await db.officerAssignment.findFirstOrThrow({
      where: { officerId },
    });
    assert.equal(
      oldAssignment.effectiveTo?.toISOString().slice(0, 10),
      `${past}-07-01`,
    );
    assert.equal(
      (await maker.get("/api/dashboard")).body.data.formerOfficers,
      1,
    );
    assert.equal(
      (await maker.get("/api/organization/groups?group=HQS")).body.meta.total,
      0,
    );
    await assert.rejects(db.officerChange.delete({ where: { id } }));
    await assert.rejects(
      db.officerChange.update({ where: { id }, data: { eventType: "DEATH" } }),
    );
    const returning = await post("/api/changes", {
      ...body,
      amendsId: id,
      eventType: "REINSTATEMENT",
      effectiveDate: `${year}-01-01`,
      targetUnitId: unitId,
      targetSubUnitId: newSubId,
    });
    assert.equal(returning.status, 201);
    const returnId = returning.body.data.id;
    assert.equal(
      (await post("/api/changes/" + returnId + "/submit", { revision: 0 }))
        .status,
      200,
    );
    assert.equal((await approve(returnId, 1)).status, 200);
    assert.equal(
      (await db.officer.findUniqueOrThrow({ where: { id: officerId } }))
        .recordStatus,
      "ACTIVE",
    );
    assert.equal(
      (await maker.get("/api/organization/groups?group=RRT")).body.meta.total,
      1,
    );
    const reversion = await post("/api/changes", {
      ...body,
      eventType: "REVERSION",
      effectiveDate: `${year}-02-01`,
      targetRankId: ciId,
    });
    assert.equal(reversion.status, 201);
    await post("/api/changes/" + reversion.body.data.id + "/submit", {
      revision: 0,
    });
    assert.equal((await approve(reversion.body.data.id, 1)).status, 200);
    const rank = await db.officerRankHistory.findFirstOrThrow({
      where: { officerId, effectiveTo: null },
    });
    assert.equal(rank.rankId, ciId);
    const suspension = await post("/api/changes", {
      ...body,
      eventType: "SUSPENSION",
      effectiveDate: `${year}-03-01`,
    });
    assert.equal(suspension.status, 201);
    await post("/api/changes/" + suspension.body.data.id + "/submit", {
      revision: 0,
    });
    assert.equal((await approve(suspension.body.data.id, 1)).status, 200);
    assert.equal(
      (await db.officer.findUniqueOrThrow({ where: { id: officerId } }))
        .recordStatus,
      "SUSPENDED",
    );
    assert.equal(
      await db.officerAssignment.count({
        where: { officerId, effectiveTo: null },
      }),
      1,
    );
    const future = await post("/api/changes", {
      ...body,
      eventType: "RETIREMENT",
      effectiveDate: `${year + 1}-01-01`,
    });
    assert.equal(future.status, 201);
    await post("/api/changes/" + future.body.data.id + "/submit", {
      revision: 0,
    });
    assert.equal((await approve(future.body.data.id, 1)).status, 422);
    const invalid = await post("/api/changes", {
      ...body,
      eventType: "SUB_UNIT_TRANSFER",
      effectiveDate: `${year}-04-01`,
      targetUnitId: otherUnitId,
      targetSubUnitId: newSubId,
    });
    assert.equal(invalid.status, 201);
    await post("/api/changes/" + invalid.body.data.id + "/submit", {
      revision: 0,
    });
    const movementCount = await db.personnelMovement.count({
      where: { officerId },
    });
    assert.equal((await approve(invalid.body.data.id, 1)).status, 422);
    assert.equal(
      await db.personnelMovement.count({ where: { officerId } }),
      movementCount,
    );
    const backdated = await post("/api/changes", {
      ...body,
      eventType: "DEATH",
      effectiveDate: `${past}-01-01`,
    });
    await post("/api/changes/" + backdated.body.data.id + "/submit", {
      revision: 0,
    });
    assert.equal((await approve(backdated.body.data.id, 1)).status, 409);
    assert.equal(
      (await maker.get("/api/changes?year=" + past)).body.data.length,
      2,
    );
    assert(
      (await maker.get("/api/changes?year=" + year)).body.data.every((r: any) =>
        r.effectiveDate.startsWith(String(year)),
      ),
    );
    const sourceList = await maker.get("/api/changes/source");
    assert.equal(sourceList.status, 200);
    assert.equal(sourceList.body.columns.length, 38);
    assert.equal(sourceList.body.data[0].cells["38"], "FICTIONAL_LAST_COLUMN");
    const reviewerOptions = await reviewer.get("/api/changes/options");
    assert.equal(reviewerOptions.body.data.canCreate, false);
    assert.equal(reviewerOptions.body.data.canApprove, true);
    assert.equal((await reviewer.get("/api/users")).status, 403);
    const financial = await db.permission.findUniqueOrThrow({
      where: { code: "fields.financial_details.view" },
    });
    const reviewerRole = await db.role.findUniqueOrThrow({
      where: { name: "Personnel Change Approver" },
    });
    await db.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: reviewerRole.id,
          permissionId: financial.id,
        },
      },
    });
    assert.equal((await reviewer.get("/api/changes?year=" + past)).status, 403);
    await db.rolePermission.create({
      data: { roleId: reviewerRole.id, permissionId: financial.id },
    });
    const audit = await db.auditLog.findMany({
      where: { userId: { in: [adminId, reviewerId] } },
    });
    assert(!JSON.stringify(audit).includes("FICTIONAL_EDITED_LAST_COLUMN"));
    assert(!JSON.stringify(audit).includes(password));
  } finally {
    // Test-only cleanup: immutable applied fixtures need the dedicated test-schema delete guard suspended.
    const migration = await readFile(
      "backend/prisma/migrations/20261030120000_officer_changes/migration.sql",
      "utf8",
    );
    const guard = migration.match(
      /CREATE TRIGGER `OfficerChange_applied_delete_guard`[\s\S]*?END;/,
    )![0];
    await db.$executeRawUnsafe(
      "DROP TRIGGER IF EXISTS OfficerChange_applied_delete_guard",
    );
    try {
      const rows = await db.officerChange.findMany({
        where: { officerId: officerId || tag },
        select: { id: true, amendsId: true },
      });
      while (rows.length) {
        const index = rows.findIndex(
          (r) => !rows.some((child) => child.amendsId === r.id),
        );
        if (index < 0) throw Error("Test amendment cycle");
        const [row] = rows.splice(index, 1);
        await db.officerChange.delete({ where: { id: row!.id } });
      }
    } finally {
      await db.$executeRawUnsafe(guard);
    }
    if (officerId) {
      await db.officerStatusHistory.deleteMany({ where: { officerId } });
      await db.personnelMovement.deleteMany({ where: { officerId } });
      await db.officerAssignment.deleteMany({ where: { officerId } });
      await db.officerRankHistory.deleteMany({ where: { officerId } });
    }
    if (batchId) {
      await db.importRow.deleteMany({ where: { batchId } });
      await db.importBatch.delete({ where: { id: batchId } });
    }
    if (officerId) await db.officer.delete({ where: { id: officerId } });
    await db.subUnit.deleteMany({
      where: { id: { in: [oldSubId, newSubId].filter(Boolean) } },
    });
    await db.unit.deleteMany({
      where: { id: { in: [unitId, otherUnitId].filter(Boolean) } },
    });
    await db.rank.deleteMany({
      where: { id: { in: [pcId, ciId].filter(Boolean) } },
    });
    const users = [adminId, reviewerId].filter(Boolean);
    await db.auditLog.deleteMany({ where: { userId: { in: users } } });
    await db.userSession.deleteMany({ where: { userId: { in: users } } });
    await db.userRole.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    if (roleId) {
      await db.rolePermission.deleteMany({ where: { roleId } });
      await db.role.delete({ where: { id: roleId } });
    }
    if (!approverRoleExisted) {
      const role = await db.role.findUnique({
        where: { name: "Personnel Change Approver" },
      });
      if (role) {
        await db.rolePermission.deleteMany({ where: { roleId: role.id } });
        await db.role.delete({ where: { id: role.id } });
      }
    }
    if (oldKey === undefined) delete process.env.WORKBOOK_IMPORT_KEY_PATH;
    else process.env.WORKBOOK_IMPORT_KEY_PATH = oldKey;
    await rm(dir, { recursive: true, force: true });
    await db.$disconnect();
  }
});
