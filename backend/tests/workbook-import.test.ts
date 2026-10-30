import "dotenv/config";
import request from "supertest";
import argon2 from "argon2";
import { createApp } from "../src/app.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/config/database.js";
import { permissions } from "../src/config/permissions.js";
import { fixture } from "../../tools/workbook-import.test.cjs";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith("_test") ||
  process.env.NODE_ENV === "production"
)
  throw new Error("Dedicated test database required");
const db = createDatabase(url),
  tag = "workbook-" + randomUUID();
test("local workbook import is atomic, permission checked, encrypted and repeat-safe", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "recce-import-db-"));
  const file = path.join(dir, "fictional.xlsx");
  const ids: string[] = [];
  let actorId = "",
    roleId = "";
  const baseline = await db.officer.count();
  const script = path.resolve("tools/import-workbook.ts");
  const run = (args: string[]) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(require.resolve("tsx")).href,
        script,
        "--file",
        file,
        ...args,
      ],
      {
        cwd: dir,
        env: { ...process.env, DATABASE_URL: url, NODE_ENV: "test" },
        encoding: "utf8",
        timeout: 30000,
      },
    );
  try {
    await fixture(file);
    // Make all identifiers unique per run, including the intentionally duplicated source pair.
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const sheet = wb.getWorksheet("NAMES")!;
    for (const n of [2, 3, 4, 5, 7])
      sheet.getRow(n).getCell(2).value = tag + "-" + (n === 5 ? 4 : n);
    await wb.xlsx.writeFile(file);
    const preview = run([]);
    assert.equal(preview.status, 0, preview.stderr);
    const digest = JSON.parse(
      preview.stdout.slice(0, preview.stdout.indexOf("\nPreview only:")),
    ).sha256;
    assert.equal(await db.officer.count(), baseline);
    const actor = await db.user.create({
      data: {
        email: tag + "@example.invalid",
        name: "Fictional Import Operator",
        passwordHash: await argon2.hash("Fictional-Import-Password-2026!"),
      },
    });
    actorId = actor.id;
    const args = [
      "--commit",
      "--sha256",
      digest,
      "--backup-confirmed",
      "--actor",
      actor.email,
    ];
    const denied = run(args);
    assert.equal(denied.status, 1);
    assert(denied.stderr.includes("IMPORT_ACTOR_NOT_AUTHORIZED"));
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
    await db.userRole.create({ data: { userId: actorId, roleId } });
    // Force a late staging failure, after officer inserts, to verify full transaction rollback.
    const trigger = "import_failure_" + randomUUID().replaceAll("-", "");
    await db.$executeRawUnsafe(
      `CREATE TRIGGER \`${trigger}\` BEFORE INSERT ON ImportRow FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Fictional import rollback test'`,
    );
    try {
      assert.equal(run(args).status, 1);
      assert.equal(await db.officer.count(), baseline);
      assert.equal(
        await db.importBatch.count({ where: { uploadedById: actorId } }),
        0,
      );
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER \`${trigger}\``);
    }
    const commit = run(args);
    assert.equal(commit.status, 0, commit.stderr);
    const batch = await db.importBatch.findFirstOrThrow({
      where: { uploadedById: actorId },
    });
    assert.equal(batch.importedRows, 3);
    assert.equal(batch.rejectedRows, 3);
    const rows = await db.importRow.findMany({ where: { batchId: batch.id } });
    ids.push(...rows.flatMap((r) => (r.officerId ? [r.officerId] : [])));
    assert.equal(ids.length, 3);
    assert.equal(
      await db.officerRankSnapshot.count({ where: { officerId: { in: ids } } }),
      3,
    );
    // Upgrade an older import without recreating its officers.
    await db.officerRankSnapshot.deleteMany({
      where: { officerId: { in: ids } },
    });
    for (const row of rows)
      assert(!JSON.stringify(row.rawData).includes("FICTIONAL-ACCOUNT-SECRET"));
    assert.equal(
      (await readFile(path.join(dir, ".local/workbook-import.key"))).length,
      32,
    );
    assert.equal(
      await db.officerRankHistory.count({ where: { officerId: { in: ids } } }),
      0,
    );
    assert.equal(
      await db.officerAssignment.count({ where: { officerId: { in: ids } } }),
      0,
    );
    const officers = await db.officer.findMany({ where: { id: { in: ids } } });
    assert(officers.every((o) => o.recordStatus === "UNVERIFIED"));
    assert.equal(run(args).status, 0);
    assert.equal(await db.officer.count(), baseline + 3);
    assert.equal(
      await db.officerRankSnapshot.count({ where: { officerId: { in: ids } } }),
      3,
    );
    assert.equal(
      await db.importBatch.count({ where: { uploadedById: actorId } }),
      1,
    );
    sheet.getRow(2).getCell(6).value = "Fictional attempted overwrite";
    await wb.xlsx.writeFile(file);
    const changedPreview = run([]);
    assert.equal(changedPreview.status, 0);
    const newDigest = JSON.parse(
      changedPreview.stdout.slice(
        0,
        changedPreview.stdout.indexOf("\nPreview only:"),
      ),
    ).sha256;
    assert.equal(run(args).status, 1); // Old preview cannot authorize changed bytes.
    const changedArgs = args.map((value) =>
      value === digest ? newDigest : value,
    );
    const second = run(changedArgs);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(await db.officer.count(), baseline + 3);
    const original = await db.officer.findUniqueOrThrow({
      where: { forceNumber: tag + "-2" },
    });
    assert.notEqual(original.fullName, "Fictional attempted overwrite");
    const previousKeyPath = process.env.WORKBOOK_IMPORT_KEY_PATH;
    process.env.WORKBOOK_IMPORT_KEY_PATH = path.join(
      dir,
      ".local/workbook-import.key",
    );
    try {
      const app = await createApp(db, {
        origin: "http://localhost:3000",
        production: false,
      });
      const agent = request.agent(app);
      const login = await agent
        .post("/api/auth/login")
        .set("Origin", "http://localhost:3000")
        .send({
          email: actor.email,
          password: "Fictional-Import-Password-2026!",
        });
      assert.equal(login.status, 200);
      const rankList = (
        await agent.get("/api/officers?q=" + encodeURIComponent(tag))
      ).body.data;
      assert(
        rankList.length > 0 &&
          rankList.every((o: any) => o.rankSource === "DATABASE"),
      );
      const sourcePermission = await db.permission.findUniqueOrThrow({
        where: { code: "fields.import_source.view" },
      });
      await db.rolePermission.delete({
        where: {
          roleId_permissionId: { roleId, permissionId: sourcePermission.id },
        },
      });
      const databaseOnly = await agent.get(
        "/api/officers?q=" + encodeURIComponent(tag),
      );
      assert.equal(databaseOnly.status, 200);
      assert(
        databaseOnly.body.data.every((o: any) => o.rankSource === "DATABASE"),
      );
      await db.rolePermission.create({
        data: { roleId, permissionId: sourcePermission.id },
      });
      const roster = await agent.get(
        "/api/organization/groups?group=MO&pageSize=1&page=1",
      );
      assert.equal(roster.status, 200);
      assert.equal(roster.body.data.length, 1);
      assert.equal(roster.body.meta.total, 1);
      assert.equal(roster.body.data[0].rank, "CI");
      assert.equal(roster.body.data[0].verifiedGroup, null);
      assert(!JSON.stringify(roster.body).includes("ACCOUNT-SECRET"));
      assert.equal(
        (await agent.get("/api/organization/groups?group=MO&rank=PC")).body.meta
          .total,
        0,
      );
      const firstPage = await agent.get(
          "/api/organization/groups?group=ALL&pageSize=1&page=1",
        ),
        secondPage = await agent.get(
          "/api/organization/groups?group=ALL&pageSize=1&page=2",
        );
      assert.equal(firstPage.body.meta.total, 3);
      assert.equal(secondPage.body.data.length, 1);
      assert.notEqual(firstPage.body.data[0].id, secondPage.body.data[0].id);
      assert.equal(
        (await agent.get("/api/organization/groups?group=RECCE")).body.meta
          .total,
        1,
      );
      assert.equal(
        (await agent.get("/api/organization/groups?group=INVALID")).status,
        422,
      );
      assert.equal(
        (await agent.get("/api/organization/groups?pageSize=1000")).status,
        422,
      );
      assert.equal(
        (
          await agent.get(
            "/api/organization/groups?group=MO&q=" +
              encodeURIComponent("' OR 1=1"),
          )
        ).body.meta.total,
        0,
      );

      const dashboard = await agent.get("/api/dashboard");
      assert.equal(dashboard.status, 200);
      assert.equal(dashboard.body.data.totalOfficers, baseline + 3);
      assert.equal(dashboard.body.data.sourceLinked, 3);
      assert.equal(dashboard.body.data.recce, 1);
      const mainGroup = dashboard.body.data.groups.find(
        (g: any) => g.code === "MO",
      );
      assert.equal(mainGroup.count, 1);
      assert.equal(mainGroup.ranks.CI, 1);
      const rankCI = dashboard.body.data.rankBreakdown.find(
        (r: any) => r.code === "CI",
      );
      assert.equal(rankCI.count, 1);
      assert.equal(rankCI.recceCount, 1);
      assert.equal(rankCI.workbookCurrent, 1);
      assert.equal(rankCI.workbookEstablishment, 2);
      assert.equal(rankCI.differenceToEstablishment, 1);
      const rankPC = dashboard.body.data.rankBreakdown.find(
        (r: any) => r.code === "PC",
      );
      assert.equal(rankPC.count, 1);
      assert.equal(rankPC.workbookCurrent, null);
      assert.equal(rankPC.workbookEstablishment, 0);
      assert.equal(rankPC.differenceToEstablishment, -1);
      assert.equal(
        dashboard.body.data.rankBreakdown.reduce(
          (sum: number, r: any) => sum + r.count,
          0,
        ),
        3,
      );
      const rankPermission = await db.permission.findUniqueOrThrow({
        where: { code: "fields.rank_history.view" },
      });
      await db.rolePermission.delete({
        where: {
          roleId_permissionId: { roleId, permissionId: rankPermission.id },
        },
      });
      assert.equal((await agent.get("/api/dashboard")).status, 403);
      assert.equal((await agent.get("/api/organization/groups")).status, 403);
      await db.rolePermission.create({
        data: { roleId, permissionId: rankPermission.id },
      });
      assert.equal(mainGroup.workbookCached, 99);
      assert.equal(
        dashboard.body.data.groups.reduce(
          (sum: number, g: any) => sum + g.count,
          0,
        ),
        3,
      );
      assert(
        !JSON.stringify(dashboard.body).includes("Fictional Import Officer"),
      );
      assert(!JSON.stringify(dashboard.body).includes("ACCOUNT-SECRET"));
      const savedOriginal = await db.officer.findUniqueOrThrow({
        where: { id: original.id },
      });
      await db.officer.update({
        where: { id: original.id },
        data: { deletedAt: new Date() },
      });
      const archivedSummary = await agent.get("/api/dashboard");
      assert.equal(archivedSummary.body.data.sourceLinked, 2);
      assert.equal(archivedSummary.body.data.recce, 0);
      assert.equal(
        (await agent.get("/api/organization/groups?group=MO")).body.meta.total,
        0,
      );
      await db.officer.update({
        where: { id: original.id },
        data: { deletedAt: null, updatedAt: savedOriginal.updatedAt },
      });
      const reportsPermission = await db.permission.findUniqueOrThrow({
        where: { code: "reports.view" },
      });
      await db.rolePermission.delete({
        where: {
          roleId_permissionId: { roleId, permissionId: reportsPermission.id },
        },
      });
      assert.equal((await agent.get("/api/dashboard")).status, 403);
      await db.rolePermission.create({
        data: { roleId, permissionId: reportsPermission.id },
      });

      const source = await agent.get(
        "/api/officers/" + original.id + "/workbook-details",
      );
      assert.equal(source.status, 200);
      assert.equal(source.body.data[0].fields.length, 37);
      assert(!source.body.data[0].fields.some((f: any) => f.column === 1));
      assert.equal(
        (
          await agent
            .post(
              "/api/officers/" +
                original.id +
                "/workbook-details/" +
                source.body.data[0].rowId +
                "/review",
            )
            .set("Origin", "http://localhost:3000")
            .set("X-CSRF-Token", login.body.data.csrfToken)
            .send({ column: 1, decision: "CHECKED", expectedRevision: 0 })
        ).status,
        422,
      );
      assert.equal(source.body.data[0].identityCheck.nameMatches, true);
      const sheetUrl =
        "/api/workbook-source?batchId=" + batch.id + "&sheet=CHANGES";
      assert.equal((await agent.get(sheetUrl)).status, 200);
      const rowId = source.body.data[0].rowId;
      const reviewUrl =
        "/api/officers/" +
        original.id +
        "/workbook-details/" +
        rowId +
        "/review";
      const csrf = login.body.data.csrfToken;
      const save = () =>
        agent
          .post(reviewUrl)
          .set("Origin", "http://localhost:3000")
          .set("X-CSRF-Token", csrf)
          .send({ column: 4, decision: "CHECKED", expectedRevision: 0 });
      assert.equal((await save()).status, 200);
      assert.equal((await save()).status, 409);
      const finance = await db.permission.findUniqueOrThrow({
        where: { code: "fields.financial_details.view" },
      });
      await db.rolePermission.delete({
        where: { roleId_permissionId: { roleId, permissionId: finance.id } },
      });
      const restricted = await agent.get(
        "/api/officers/" + original.id + "/workbook-details",
      );
      assert.equal(restricted.status, 200);
      assert.equal((await agent.get(sheetUrl)).status, 403);
      assert(!restricted.body.data[0].fields.some((f: any) => f.column === 36));
      const rollbackArgs = [
        "--import",
        pathToFileURL(require.resolve("tsx")).href,
        path.resolve("tools/rollback-workbook.ts"),
        "--batch",
        batch.id,
        "--backup-confirmed",
        "--actor",
        actor.email,
      ];
      const rollback = () =>
        spawnSync(process.execPath, rollbackArgs, {
          cwd: dir,
          env: { ...process.env, DATABASE_URL: url, NODE_ENV: "test" },
          encoding: "utf8",
        });
      const blocked = rollback();
      assert.equal(blocked.status, 1);
      assert(
        blocked.stderr.includes("REVIEWED_RECORDS_REQUIRE_MANUAL_ROLLBACK"),
      );
      // Reset only the test review so the pristine-import rollback path can be exercised.
      await db.systemSetting.deleteMany({
        where: { settingKey: "_import.review." + rowId },
      });
      await db.importRow.update({
        where: { id: rowId },
        data: { verificationStatus: "UNVERIFIED" },
      });
      const reverted = rollback();
      assert.equal(reverted.status, 0, reverted.stderr);
      assert.equal(await db.officer.count(), baseline);
      assert.equal(
        await db.officerRankSnapshot.count({ where: { seededById: actorId } }),
        0,
      );
      assert.equal(
        (await db.importBatch.findUniqueOrThrow({ where: { id: batch.id } }))
          .status,
        "ROLLED_BACK",
      );
      assert.equal(rollback().status, 0);
    } finally {
      if (previousKeyPath === undefined)
        delete process.env.WORKBOOK_IMPORT_KEY_PATH;
      else process.env.WORKBOOK_IMPORT_KEY_PATH = previousKeyPath;
    }
    assert(!commit.stdout.includes("Fictional Import Officer"));
    assert(!commit.stderr.includes("ACCOUNT-SECRET"));
  } finally {
    const batches = await db.importBatch.findMany({
      where: { uploadedById: actorId || tag },
    });
    const batchIds = batches.map((b) => b.id);
    const rows = await db.importRow.findMany({
      where: { batchId: { in: batchIds } },
    });
    const officerIds = [
      ...new Set([
        ...ids,
        ...rows.flatMap((r) => (r.officerId ? [r.officerId] : [])),
      ]),
    ];
    await db.officerRankSnapshot.deleteMany({
      where: { sourceRow: { batchId: { in: batchIds } } },
    });
    await db.importRow.deleteMany({ where: { batchId: { in: batchIds } } });
    await db.importBatch.deleteMany({ where: { id: { in: batchIds } } });
    await db.officerEducation.deleteMany({
      where: { officerId: { in: officerIds } },
    });
    await db.officer.deleteMany({ where: { id: { in: officerIds } } });
    if (actorId) {
      await db.auditLog.deleteMany({ where: { userId: actorId } });
      await db.userRole.deleteMany({ where: { userId: actorId } });
      await db.userSession.deleteMany({ where: { userId: actorId } });
      await db.user.delete({ where: { id: actorId } });
    }
    if (roleId) {
      await db.rolePermission.deleteMany({ where: { roleId } });
      await db.role.delete({ where: { id: roleId } });
    }
    await rm(dir, { recursive: true, force: true });
    await db.$disconnect();
  }
});
