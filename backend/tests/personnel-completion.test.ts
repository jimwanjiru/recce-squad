import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, rename, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import argon2 from "argon2";
import request from "supertest";
import { createDatabase } from "../src/config/database.js";
import { createApp } from "../src/app.js";
import { sealSource } from "../src/services/workbook-source.js";
import { permissions } from "../src/config/permissions.js";
import { readWorkbook } from "../../tools/workbook-import-data.cjs";
import { fixture } from "../../tools/workbook-import.test.cjs";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith("_test") ||
  process.env.NODE_ENV === "production"
)
  throw Error("Dedicated test database required");
const db = createDatabase(url),
  tag = "completion-" + randomUUID();
test("approved personnel completion is atomic, preserves edits, excludes CHANGES and runs from database facts without Excel", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "recce-completion-")),
    file = path.join(dir, "fictional.xlsx");
  const previousKey = process.env.WORKBOOK_IMPORT_KEY_PATH;
  let actorId = "",
    roleId = "",
    batchId = "";
  const password = "Fictional-Completion-Password-2026!";
  const run = (script: string, args: string[]) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(require.resolve("tsx")).href,
        path.resolve(script),
        ...args,
      ],
      {
        cwd: dir,
        env: {
          ...process.env,
          DATABASE_URL: url,
          NODE_ENV: "test",
          WORKBOOK_IMPORT_KEY_PATH: path.join(
            dir,
            ".local/workbook-import.key",
          ),
        },
        encoding: "utf8",
        timeout: 120000,
      },
    );
  try {
    await fixture(file);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const names = wb.getWorksheet("NAMES")!;
    for (let n = 4; n <= 7; n++)
      names.getRow(n).eachCell((cell) => {
        cell.value = null;
      });
    names.getCell(1, 16).value = "DUTIES";
    for (const row of [2, 3]) {
      names.getCell(row, 2).value = tag + "-" + row;
      names.getCell(row, 16).value =
        "  Fictional duty / recorded wording " + row + "  ";
      names.getCell(row, 7).value = "Fictional ethnicity " + tag;
      names.getCell(row, 10).value = "Fictional county " + tag;
    }
    names.getCell(2, 4).value = "Cpl/Drv";
    names.getCell(2, 5).value = "CPL";
    names.getCell(2, 17).value = "Fictional places served";
    names.getCell(2, 18).value = "Fictional course";
    names.getCell(2, 25).value = "Fictional exam";
    names.getCell(2, 26).value = "Fictional award";
    names.getCell(2, 28).value = "Fictional disciplinary notation";
    names.getCell(2, 29).value = "Fictional warning";
    names.getCell(2, 37).value = "Fictional Bank";
    const tribe = wb.addWorksheet("TRIBE ");
    tribe.addRow([
      "S/NO",
      "TRIBE",
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
      "TOTAL",
    ]);
    tribe.addRow([
      1,
      "Fictional ethnicity " + tag,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      2,
    ]);
    await wb.xlsx.writeFile(file);
    const parsed = await readWorkbook(file);
    assert.equal(parsed.summary.candidateOfficers, 2);
    assert.equal(parsed.summary.heldOfficers, 0);
    assert(!parsed.rows.some((r) => r.sheet.trim() === "CHANGES"));
    const actor = await db.user.create({
      data: {
        email: tag + "@example.invalid",
        name: "Fictional completion operator",
        passwordHash: await argon2.hash(password),
      },
    });
    actorId = actor.id;
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
    const initial = run("tools/import-workbook.ts", [
      "--file",
      file,
      "--commit",
      "--sha256",
      parsed.sha256,
      "--backup-confirmed",
      "--actor",
      actor.email,
    ]);
    assert.equal(initial.status, 0, initial.stderr);
    const batch = await db.importBatch.findFirstOrThrow({
      where: { fileSha256: parsed.sha256 },
    });
    batchId = batch.id;
    assert.equal(
      await db.importRow.count({ where: { batchId, sheetName: "CHANGES" } }),
      0,
    );
    // Existing legacy source records stay untouched, even when they are from CHANGES.
    const legacy = await db.importRow.create({
      data: {
        batchId,
        sheetName: "CHANGES",
        rowNumber: 999,
        rawData: { legacy: true },
        unresolvedDates: {},
        validationErrors: [],
        status: "SOURCE_ONLY",
      },
    });
    const changesBefore = await db.officerChange.count(),
      movementsBefore = await db.personnelMovement.count();
    const first = await db.officer.findUniqueOrThrow({
      where: { forceNumber: tag + "-2" },
    });
    const second = await db.officer.findUniqueOrThrow({
      where: { forceNumber: tag + "-3" },
    });
    await db.officer.update({
      where: { id: first.id },
      data: {
        fullName: "Fictional manually edited name",
        phone: "MANUAL-PHONE",
        assignedDuties: "Manually assigned duty",
        version: { increment: 1 },
      },
    });
    const args = [
      "--file",
      file,
      "--batch",
      batchId,
      "--sha256",
      parsed.sha256,
      "--actor",
      actor.email,
    ];
    const commitPermission = await db.permission.findUniqueOrThrow({
      where: { code: "imports.commit" },
    });
    await db.rolePermission.delete({
      where: {
        roleId_permissionId: { roleId, permissionId: commitPermission.id },
      },
    });
    assert.equal(run("tools/complete-personnel-import.ts", args).status, 1);
    await db.rolePermission.create({
      data: { roleId, permissionId: commitPermission.id },
    });
    const changedDigestArgs = args.map((v) =>
      v === parsed.sha256 ? "0".repeat(64) : v,
    );
    assert.equal(
      run("tools/complete-personnel-import.ts", changedDigestArgs).status,
      1,
    );
    const preview = run("tools/complete-personnel-import.ts", args);
    assert.equal(preview.status, 0, preview.stderr);
    assert(preview.stdout.includes('"added": 2'));
    assert.equal(
      await db.officerPersonnelData.count({
        where: { officerId: { in: [first.id, second.id] } },
      }),
      0,
    );
    assert.equal(
      run("tools/complete-personnel-import.ts", [...args, "--commit"]).status,
      1,
    );
    const commitArgs = [
      ...args,
      "--commit",
      "--approved",
      "--backup-confirmed",
    ];
    const trigger = "completion_failure_" + randomUUID().replaceAll("-", "");
    await db.$executeRawUnsafe(
      `CREATE TRIGGER \`${trigger}\` BEFORE INSERT ON PersonnelSummaryRecord FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Fictional late failure'`,
    );
    try {
      assert.equal(
        run("tools/complete-personnel-import.ts", commitArgs).status,
        1,
      );
      assert.equal(
        await db.officerPersonnelData.count({
          where: { officerId: { in: [first.id, second.id] } },
        }),
        0,
      );
      assert.equal(
        (await db.officer.findUniqueOrThrow({ where: { id: second.id } }))
          .assignedDuties,
        null,
      );
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER \`${trigger}\``);
    }
    const completed = run("tools/complete-personnel-import.ts", commitArgs);
    assert.equal(completed.status, 0, completed.stderr);
    assert(!completed.stdout.includes("Fictional duty"));
    const after = await db.officer.findUniqueOrThrow({
      where: { id: first.id },
      include: { personnelData: true, ethnicity: true },
    });
    assert.equal(after.fullName, "Fictional manually edited name");
    assert.equal(after.phone, "MANUAL-PHONE");
    assert.equal(after.assignedDuties, "Manually assigned duty");
    assert.equal(after.ethnicity?.name, "Fictional ethnicity " + tag);
    assert(!JSON.stringify(after.personnelData).includes("ACCOUNT-SECRET"));
    assert(!("1" in (after.personnelData!.details as object)));
    assert.equal(
      (await db.officer.findUniqueOrThrow({ where: { id: second.id } }))
        .assignedDuties,
      "  Fictional duty / recorded wording 3  ",
    );
    await db.officer.update({
      where: { id: second.id },
      data: { assignedDuties: null, version: { increment: 1 } },
    });
    const repeated = run("tools/complete-personnel-import.ts", commitArgs);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert(repeated.stdout.includes('"added": 0'));
    assert.equal(
      (await db.officer.findUniqueOrThrow({ where: { id: second.id } }))
        .assignedDuties,
      null,
    );
    // Simulate a completed v1 batch with unsupported/missing fields and manual edits.
    const keyPath = path.join(dir, ".local/workbook-import.key");
    const keyBefore = await readFile(keyPath);
    const legacyDetails = {
      ...(after.personnelData!.details as Record<string, string>),
    };
    for (let c = 2; c <= 38; c++)
      if (![16, 36, 37].includes(c))
        assert(
          Object.hasOwn(legacyDetails, String(c)),
          `Missing mapped column ${c}`,
        );
    delete legacyDetails["18"];
    delete legacyDetails["27"];
    legacyDetails["17"] = "Manual places served";
    legacyDetails["23"] = "";
    await db.officer.update({
      where: { id: first.id },
      data: { phone: null, version: { increment: 1 } },
    });
    await db.auditLog.create({
      data: {
        userId: actorId,
        entityType: "Officer",
        entityId: first.id,
        action: "OFFICER_UPDATED",
        changedFields: ["phone"],
      },
    });
    await db.officerPersonnelData.update({
      where: { officerId: first.id },
      data: {
        mappingVersion: 1,
        details: legacyDetails,
        encryptedFinance: sealSource(
          { 36: "FICTIONAL-ACCOUNT-SECRET" },
          keyBefore,
          `personnel:${first.id}:finance`,
        ),
      },
    });
    const upgradePreview = run("tools/complete-personnel-import.ts", args);
    assert.equal(upgradePreview.status, 0, upgradePreview.stderr);
    assert(upgradePreview.stdout.includes('"upgraded": 1'));
    assert(upgradePreview.stdout.includes('"fieldsAdded": 3'));
    assert.equal(
      (
        await db.officerPersonnelData.findUniqueOrThrow({
          where: { officerId: first.id },
        })
      ).mappingVersion,
      1,
    );
    const upgradeTrigger =
      "upgrade_failure_" + randomUUID().replaceAll("-", "");
    await db.$executeRawUnsafe(
      `CREATE TRIGGER \`${upgradeTrigger}\` BEFORE INSERT ON AuditLog FOR EACH ROW BEGIN IF NEW.action='PERSONNEL_DETAILS_UPGRADED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Fictional upgrade failure'; END IF; END`,
    );
    try {
      assert.equal(
        run("tools/complete-personnel-import.ts", commitArgs).status,
        1,
      );
      const unchanged = await db.officerPersonnelData.findUniqueOrThrow({
        where: { officerId: first.id },
      });
      assert.equal(unchanged.mappingVersion, 1);
      assert(!Object.hasOwn(unchanged.details as object, "18"));
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER \`${upgradeTrigger}\``);
    }
    const upgrade = run("tools/complete-personnel-import.ts", commitArgs);
    assert.equal(upgrade.status, 0, upgrade.stderr);
    const upgraded = await db.officerPersonnelData.findUniqueOrThrow({
      where: { officerId: first.id },
    });
    assert.equal(upgraded.mappingVersion, 2);
    assert.equal((upgraded.details as any)["18"], "Fictional course");
    assert.equal((upgraded.details as any)["17"], "Manual places served");
    assert.equal((upgraded.details as any)["23"], "");
    assert.equal((upgraded.details as any)["27"], "");
    assert.deepEqual(await readFile(keyPath), keyBefore);
    const repeatUpgrade = run("tools/complete-personnel-import.ts", commitArgs);
    assert.equal(repeatUpgrade.status, 0, repeatUpgrade.stderr);
    assert(repeatUpgrade.stdout.includes('"fieldsAdded": 0'));
    assert(repeatUpgrade.stdout.includes('"upgraded": 0'));
    assert.deepEqual(
      await db.officerPersonnelData.findUnique({
        where: { officerId: first.id },
      }),
      upgraded,
    );
    assert.equal(
      await db.auditLog.count({
        where: { entityId: batchId, action: "PERSONNEL_IMPORT_APPROVED" },
      }),
      1,
    );
    assert.deepEqual(
      await db.importRow.findUnique({ where: { id: legacy.id } }),
      legacy,
    );
    assert.equal(await db.officerChange.count(), changesBefore);
    assert.equal(await db.personnelMovement.count(), movementsBefore);
    assert.equal(
      await db.officerRankHistory.count({
        where: { officerId: { in: [first.id, second.id] } },
      }),
      0,
    );
    // Remove the source file; ordinary non-financial reads must not even require its encryption key.
    await rename(file, file + ".removed");
    process.env.WORKBOOK_IMPORT_KEY_PATH = path.join(dir, "missing-key");
    const app = await createApp(db, {
        origin: "http://localhost:3000",
        production: false,
      }),
      agent = request.agent(app);
    const login = await agent
      .post("/api/auth/login")
      .set("Origin", "http://localhost:3000")
      .send({ email: actor.email, password });
    assert.equal(login.status, 200);
    const csrf = login.body.data.csrfToken;
    const finance = await db.permission.findUniqueOrThrow({
      where: { code: "fields.financial_details.view" },
    });
    await db.rolePermission.delete({
      where: { roleId_permissionId: { roleId, permissionId: finance.id } },
    });
    let details = await agent.get(
      `/api/officers/${first.id}/personnel-details`,
    );
    assert.equal(details.status, 200);
    assert(
      details.body.data.some(
        (f: any) =>
          f.label === "Assigned duties" && f.value === "Manually assigned duty",
      ),
    );
    assert(
      !details.body.data.some((f: any) => f.column === 1 || f.column === 36),
    );
    assert(
      details.body.data.some(
        (f: any) =>
          f.column === 28 && f.value === "Fictional disciplinary notation",
      ),
    );
    assert(!JSON.stringify(details.body).includes("verification"));
    const dashboard = await agent.get("/api/dashboard");
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.data.recce, 1);
    assert.equal(
      dashboard.body.data.groups.find((g: any) => g.code === "MO")
        .workbookCached,
      99,
    );
    assert.equal(
      dashboard.body.data.groups.find((g: any) => g.code === "MO").count,
      1,
    );
    assert.equal(
      dashboard.body.data.rankBreakdown.find((r: any) => r.code === "CPL")
        .count,
      1,
    );
    const page1 = await agent.get(
        "/api/organization/groups?group=ALL&pageSize=1&page=1&q=" + tag,
      ),
      page2 = await agent.get(
        "/api/organization/groups?group=ALL&pageSize=1&page=2&q=" + tag,
      );
    assert.equal(page1.body.meta.total, 2);
    assert.notEqual(page1.body.data[0].id, page2.body.data[0].id);
    assert.equal(
      (await agent.get("/api/organization/groups?group=MO&rank=PC")).body.meta
        .total,
      0,
    );

    const roster = await agent.get(
      "/api/organization/groups?group=MO&q=" + tag,
    );
    assert.equal(roster.status, 200);
    assert.equal(roster.body.data[0].rank, "CPL");
    assert.equal(roster.body.data[0].originalRank, "Cpl/Drv");
    const comparison = await agent.get(
      "/api/personnel-summaries?section=TRIBE",
    );
    assert.equal(comparison.status, 200);
    assert(
      comparison.body.data.some((r: any) =>
        r.fields.some((f: any) => f.value === "Fictional ethnicity " + tag),
      ),
    );
    assert.equal(
      (await agent.get("/api/personnel-summaries?section=CHANGES")).status,
      422,
    );
    const officerRead = await agent.get(`/api/officers/${first.id}`);
    assert.equal(
      officerRead.body.data.assignedDuties,
      "Manually assigned duty",
    );
    const patch = (body: object) =>
      agent
        .patch(`/api/officers/${first.id}`)
        .set("Origin", "http://localhost:3000")
        .set("X-CSRF-Token", csrf)
        .send(body);
    const edited = await patch({
      version: officerRead.body.data.version,
      assignedDuties: "New fictional duty",
      phone: null,
    });
    assert.equal(edited.status, 200);
    const cleared = await agent.get(
      `/api/officers/${first.id}/personnel-details`,
    );
    assert.equal(cleared.body.data.find((f: any) => f.column === 27).value, "");
    assert.equal(
      (
        await patch({
          version: officerRead.body.data.version,
          assignedDuties: "Stale",
        })
      ).status,
      409,
    );
    const write = await db.permission.findUniqueOrThrow({
      where: { code: "fields.assignments.write" },
    });
    await db.rolePermission.delete({
      where: { roleId_permissionId: { roleId, permissionId: write.id } },
    });
    assert.equal(
      (
        await patch({
          version: edited.body.data.version,
          assignedDuties: "Denied",
        })
      ).status,
      403,
    );
    const view = await db.permission.findUniqueOrThrow({
      where: { code: "fields.assignments.view" },
    });
    await db.rolePermission.delete({
      where: { roleId_permissionId: { roleId, permissionId: view.id } },
    });
    assert(
      !(
        "assignedDuties" in
        (await agent.get(`/api/officers/${first.id}`)).body.data
      ),
    );
    details = await agent.get(`/api/officers/${first.id}/personnel-details`);
    assert(
      !details.body.data.some((f: any) => f.column === 16 || f.column === 17),
    );
    process.env.WORKBOOK_IMPORT_KEY_PATH = path.join(
      dir,
      ".local/workbook-import.key",
    );
    await db.rolePermission.create({
      data: { roleId, permissionId: finance.id },
    });
    details = await agent.get(`/api/officers/${first.id}/personnel-details`);
    assert.equal(details.status, 200);
    assert(
      details.body.data.some(
        (f: any) => f.column === 36 && f.value === "FICTIONAL-ACCOUNT-SECRET",
      ),
    );
  } finally {
    if (previousKey === undefined) delete process.env.WORKBOOK_IMPORT_KEY_PATH;
    else process.env.WORKBOOK_IMPORT_KEY_PATH = previousKey;
    const officers = await db.officer.findMany({
      where: { forceNumber: { startsWith: tag } },
    });
    const ids = officers.map((o) => o.id);
    await db.officerPersonnelData.deleteMany({
      where: { officerId: { in: ids } },
    });
    await db.personnelSummaryRecord.deleteMany({ where: { batchId } });
    await db.officerRankSnapshot.deleteMany({
      where: { officerId: { in: ids } },
    });
    await db.importRow.deleteMany({ where: { batchId } });
    if (batchId) await db.importBatch.delete({ where: { id: batchId } });
    await db.officerEducation.deleteMany({ where: { officerId: { in: ids } } });
    await db.officer.deleteMany({ where: { id: { in: ids } } });
    await db.ethnicity.deleteMany({
      where: { name: "Fictional ethnicity " + tag },
    });
    await db.county.deleteMany({ where: { name: "Fictional county " + tag } });
    if (batchId)
      await db.systemSetting.deleteMany({
        where: { settingKey: `_import.personnel-approved.${batchId}` },
      });
    if (actorId) {
      await db.auditLog.deleteMany({ where: { userId: actorId } });
      await db.userSession.deleteMany({ where: { userId: actorId } });
      await db.userRole.deleteMany({ where: { userId: actorId } });
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
