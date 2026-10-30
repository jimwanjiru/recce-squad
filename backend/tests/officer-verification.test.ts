import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import argon2 from "argon2";
import request from "supertest";
import { permissions } from "../src/config/permissions.js";
import { createDatabase } from "../src/config/database.js";
import { createApp } from "../src/app.js";
import { seal } from "../../tools/workbook-import-data.cjs";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith("_test") ||
  process.env.NODE_ENV === "production"
)
  throw Error("Dedicated test database required");
const db = createDatabase(url);
test("import verification is scoped, audited, repeat-safe and separate from service states, field warnings and histories", async () => {
  const tag = "verify-" + randomUUID(),
    dir = await mkdtemp(path.join(os.tmpdir(), "recce-verify-")),
    ids: string[] = [];
  let actorId = "",
    readerId = "",
    roleId = "",
    batchId = "";
  const password = "Fictional-Verification-Password-2026!",
    email = tag + "@example.invalid";
  const key = randomBytes(32),
    keyPath = path.join(dir, ".local/workbook-import.key");
  await mkdir(path.dirname(keyPath));
  await writeFile(keyPath, key);
  const run = (args: string[]) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(require.resolve("tsx")).href,
        path.resolve("tools/verify-officers.ts"),
        "--batch",
        batchId,
        ...args,
      ],
      {
        cwd: dir,
        env: {
          ...process.env,
          DATABASE_URL: url,
          NODE_ENV: "test",
          WORKBOOK_IMPORT_KEY_PATH: keyPath,
        },
        encoding: "utf8",
        timeout: 30000,
      },
    );
  try {
    actorId = (
      await db.user.create({
        data: {
          email,
          name: "Fictional Verifier",
          passwordHash: await argon2.hash(password),
        },
      })
    ).id;
    readerId = (
      await db.user.create({
        data: {
          email: tag + "-reader@example.invalid",
          name: "Fictional Unauthorized Verifier",
          passwordHash: await argon2.hash(password),
        },
      })
    ).id;
    roleId = (await db.role.create({ data: { name: tag } })).id;
    for (const code of permissions) {
      const p = await db.permission.upsert({
        where: { code },
        create: { code, description: code },
        update: {},
      });
      await db.rolePermission.create({ data: { roleId, permissionId: p.id } });
    }
    await db.userRole.create({ data: { userId: actorId, roleId } });
    batchId = (
      await db.importBatch.create({
        data: {
          filename: "Fictional verification fixture",
          fileSha256: tag,
          uploadedById: actorId,
          status: "CORE_IMPORTED_REVIEW_PENDING",
        },
      })
    ).id;
    for (const [index, recordStatus] of ["UNVERIFIED", "RETIRED"].entries()) {
      const forceNumber = tag + "-" + index,
        fullName = "Fictional Verification Officer " + index;
      const officer = await db.officer.create({
        data: { forceNumber, fullName, recordStatus },
      });
      ids.push(officer.id);
      const row = await db.importRow.create({
        data: {
          batchId,
          sheetName: "NAMES",
          rowNumber: index + 2,
          officerId: officer.id,
          rawData: seal(
            { 2: forceNumber, 4: "Cpl/Drv", 5: "Cpl", 6: fullName, 15: "2025" },
            key,
            `${tag}:NAMES:${index + 2}`,
          ),
          unresolvedDates: {},
          validationErrors: index ? [] : ["UNRESOLVED_DATE_COLUMN_15"],
          status: "CORE_IMPORTED_REVIEW_PENDING",
        },
      });
      await db.officerRankSnapshot.create({
        data: {
          officerId: officer.id,
          sourceRowId: row.id,
          rank1: "Cpl/Drv",
          rank2: "Cpl",
          rankCode: "CPL",
          seededById: actorId,
        },
      });
    }
    const unrelated = await db.officer.create({
      data: {
        forceNumber: tag + "-unrelated",
        fullName: "Fictional Unrelated Officer",
        recordStatus: "UNVERIFIED",
      },
    });
    ids.push(unrelated.id);
    assert.equal(
      run(["--actor", tag + "-reader@example.invalid", "--commit"]).status,
      1,
    );
    const preview = run(["--actor", email]);
    assert.equal(preview.status, 0, preview.stderr);
    assert(preview.stdout.includes('"awaitingVerification": 2'));
    assert.equal(
      await db.officer.count({
        where: { id: { in: ids }, verificationStatus: "VERIFIED" },
      }),
      0,
    );
    const committed = run(["--actor", email, "--commit"]);
    assert.equal(committed.status, 0, committed.stderr);
    assert(committed.stdout.includes('"verified": 2'));
    assert(committed.stdout.includes('"rowsWithFieldWarnings": 1'));
    const first = await db.officer.findUniqueOrThrow({ where: { id: ids[0] } });
    assert.equal(first.verificationStatus, "VERIFIED");
    assert(first.verifiedAt);
    assert.equal(first.verifiedById, actorId);
    assert.equal(first.recordStatus, "UNVERIFIED");
    assert.equal(first.version, 1);
    assert.equal(
      (await db.officer.findUniqueOrThrow({ where: { id: ids[1] } }))
        .recordStatus,
      "RETIRED",
    );
    assert.equal(
      (await db.officer.findUniqueOrThrow({ where: { id: unrelated.id } }))
        .verificationStatus,
      "UNVERIFIED",
    );
    assert.equal(
      await db.officerRankHistory.count({ where: { officerId: { in: ids } } }),
      0,
    );
    assert.equal(
      await db.officerStatusHistory.count({
        where: { officerId: { in: ids } },
      }),
      0,
    );
    assert(
      (await db.importRow.findMany({ where: { batchId } })).every(
        (r) => r.verificationStatus === "UNVERIFIED",
      ),
    );
    const audits = await db.auditLog.count({ where: { userId: actorId } });
    const repeated = run(["--actor", email, "--commit"]);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert(repeated.stdout.includes('"alreadyVerified": 2'));
    assert.equal(
      await db.auditLog.count({ where: { userId: actorId } }),
      audits,
    );
    assert.equal(
      +(await db.officer.findUniqueOrThrow({ where: { id: ids[0] } }))
        .verifiedAt!,
      +first.verifiedAt!,
    );
    await assert.rejects(
      db.officer.update({ where: { id: ids[0] }, data: { verifiedAt: null } }),
    );
    const app = await createApp(db, {
        origin: "http://localhost:3000",
        production: false,
      }),
      agent = request.agent(app);
    const login = await agent
      .post("/api/auth/login")
      .set("Origin", "http://localhost:3000")
      .send({ email, password })
      .expect(200);
    const listed = await agent
      .get("/api/officers?recordStatus=VERIFIED&q=" + encodeURIComponent(tag))
      .expect(200);
    assert.equal(listed.body.meta.total, 2);
    assert(
      listed.body.data.every(
        (o: any) =>
          o.verificationStatus === "VERIFIED" &&
          o.rankSource === "VERIFIED_IMPORT",
      ),
    );
    await agent
      .patch("/api/officers/" + ids[0])
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", login.body.data.csrfToken)
      .send({ version: first.version, fullName: "Fictional Edited Officer" })
      .expect(200);
    const edited = await db.officer.findUniqueOrThrow({
      where: { id: ids[0] },
    });
    assert.equal(edited.verificationStatus, "UNVERIFIED");
    assert.equal(edited.verifiedAt, null);
    assert.equal(edited.verifiedById, null);
    assert.equal(
      (
        await agent
          .get(
            "/api/officers?recordStatus=VERIFIED&q=" + encodeURIComponent(tag),
          )
          .expect(200)
      ).body.meta.total,
      1,
    );
    assert.equal(run(["--actor", email, "--commit"]).status, 0);
    const prior = await db.officer.findMany({
      where: { id: { in: ids } },
      orderBy: { id: "asc" },
    });
    const row = await db.importRow.findFirstOrThrow({ where: { batchId } }),
      raw = row.rawData;
    await db.importRow.update({
      where: { id: row.id },
      data: {
        rawData: seal(
          { 2: "FICTIONAL-WRONG-IDENTITY" },
          key,
          `${tag}:NAMES:${row.rowNumber}`,
        ),
      },
    });
    assert.equal(run(["--actor", email, "--commit"]).status, 1);
    assert.deepEqual(
      await db.officer.findMany({
        where: { id: { in: ids } },
        orderBy: { id: "asc" },
      }),
      prior,
    );
    await db.importRow.update({
      where: { id: row.id },
      data: { rawData: raw! },
    });
    const logs = JSON.stringify(
      await db.auditLog.findMany({ where: { userId: actorId } }),
    );
    assert(
      !logs.includes("Cpl/Drv") && !logs.includes("Fictional Edited Officer"),
    );
  } finally {
    await db.officerRankSnapshot.deleteMany({
      where: { officerId: { in: ids } },
    });
    if (batchId) {
      await db.importRow.deleteMany({ where: { batchId } });
      await db.importBatch.delete({ where: { id: batchId } });
    }
    await db.officer.deleteMany({ where: { id: { in: ids } } });
    for (const id of [actorId, readerId].filter(Boolean)) {
      await db.auditLog.deleteMany({ where: { userId: id } });
      await db.userSession.deleteMany({ where: { userId: id } });
      await db.userRole.deleteMany({ where: { userId: id } });
      await db.user.delete({ where: { id } });
    }
    if (roleId) {
      await db.rolePermission.deleteMany({ where: { roleId } });
      await db.role.delete({ where: { id: roleId } });
    }
    await rm(dir, { recursive: true, force: true });
    await db.$disconnect();
  }
});
