import "dotenv/config";
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
        passwordHash: "not-a-login-hash",
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
    await db.importRow.deleteMany({ where: { batchId: { in: batchIds } } });
    await db.importBatch.deleteMany({ where: { id: { in: batchIds } } });
    await db.officerEducation.deleteMany({
      where: { officerId: { in: officerIds } },
    });
    await db.officer.deleteMany({ where: { id: { in: officerIds } } });
    if (actorId) {
      await db.auditLog.deleteMany({ where: { userId: actorId } });
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
