import "dotenv/config";
import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { seal } from "../../tools/workbook-import-data.cjs";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { createDatabase } from "../../backend/src/config/database";
import { permissions } from "../../backend/src/config/permissions";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("Dedicated test database required");
const db = createDatabase(url),
  tag = "browser-" + randomUUID(),
  email = tag + "@example.invalid",
  password = "Fictional-Browser-Password-2026!";
let userId: string,
  roleId: string,
  sourceBatchId = "",
  sourceRowId = "";
let sourceKey: Buffer;
test.beforeAll(async () => {
  await mkdir(".local", { recursive: true });
  try {
    await writeFile(".local/browser-source.key", randomBytes(32), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;
  }
  sourceKey = await readFile(".local/browser-source.key");
  roleId = (await db.role.create({ data: { name: tag } })).id;
  for (const code of permissions) {
    const p = await db.permission.upsert({
      where: { code },
      create: { code, description: code },
      update: {},
    });
    await db.rolePermission.create({ data: { roleId, permissionId: p.id } });
  }
  const user = await db.user.create({
    data: {
      name: "Fictional Browser Administrator",
      email,
      passwordHash: await argon2.hash(password),
    },
  });
  userId = user.id;
  await db.userRole.create({ data: { userId, roleId } });
});
test.afterAll(async () => {
  const records = await db.officer.findMany({
    where: { forceNumber: { startsWith: tag } },
    select: { id: true },
  });
  const ids = records.map((o) => o.id);
  await db.officerServiceProfile.deleteMany({
    where: { officerId: { in: ids } },
  });
  if (sourceRowId)
    await db.systemSetting.deleteMany({
      where: { settingKey: "_import.review." + sourceRowId },
    });
  if (sourceBatchId) {
    await db.importRow.deleteMany({ where: { batchId: sourceBatchId } });
    await db.importBatch.delete({ where: { id: sourceBatchId } });
  }
  await db.officer.deleteMany({ where: { id: { in: ids } } });
  await db.auditLog.deleteMany({ where: { userId } });
  await db.userSession.deleteMany({ where: { userId } });
  await db.userRole.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.rolePermission.deleteMany({ where: { roleId } });
  await db.role.deleteMany({ where: { id: roleId } });
  await db.$disconnect();
});
test("register, edit, search, archive and restore a fictional officer on desktop and mobile", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.name));
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(
    page.getByRole("heading", { name: "Officers", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Register officer", exact: true })
    .click();
  await page.getByLabel("Force number", { exact: false }).fill(tag);
  await page
    .getByLabel("Full name", { exact: false })
    .fill("Fictional Browser Officer");
  await page.getByLabel("Payroll number", { exact: true }).fill("00001234");
  await page.getByLabel("Phone number", { exact: true }).fill("000-TEST-PHONE");
  await page
    .getByRole("button", { name: "Register officer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Fictional Browser Officer",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("00001234", { exact: true })).toBeVisible();
  const sourceOfficerId = new URL(page.url()).pathname.split("/")[2];
  const batch = await db.importBatch.create({
    data: {
      filename: "Fictional browser workbook",
      fileSha256: tag,
      uploadedById: userId,
      status: "CORE_IMPORTED_REVIEW_PENDING",
      totalRows: 1,
      importedRows: 1,
    },
  });
  sourceBatchId = batch.id;
  const source = await db.importRow.create({
    data: {
      batchId: batch.id,
      sheetName: "NAMES",
      rowNumber: 2,
      officerId: sourceOfficerId,
      rawData: seal(
        {
          2: tag,
          6: "Fictional Browser Officer",
          4: "Fictional Specialist Designation",
          36: "FICTIONAL_BANK_SOURCE",
        },
        sourceKey,
        `${tag}:NAMES:2`,
      ),
      unresolvedDates: {},
      validationErrors: [],
      status: "CORE_IMPORTED_REVIEW_PENDING",
    },
  });
  sourceRowId = source.id;
  await page
    .getByRole("tab", { name: "Workbook details", exact: true })
    .click();
  await expect(
    page.getByText("Fictional Specialist Designation", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("FICTIONAL_BANK_SOURCE", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mark checked", exact: true })
    .first()
    .click();
  await expect(page.getByText(/Source checked ·/)).toBeVisible();
  await page.getByRole("tab", { name: "Overview", exact: true }).click();

  await page.getByRole("link", { name: "Edit record" }).click();
  await page
    .getByLabel("Full name", { exact: false })
    .fill("Fictional Browser Officer Updated");
  const officerId = new URL(page.url()).pathname.split("/")[2];
  const currentRecord = await (
    await page.request.get("/api/officers/" + officerId)
  ).json();
  const refreshedToken = await (
    await page.request.get("/api/auth/csrf")
  ).json();
  const parallelChange = await page.request.patch(
    "/api/officers/" + officerId,
    {
      headers: {
        Origin: "http://127.0.0.1:3100",
        "X-CSRF-Token": refreshedToken.data.csrfToken,
      },
      data: { version: currentRecord.data.version, phone: "000-CONCURRENT" },
    },
  );
  expect(parallelChange.status()).toBe(200);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toContainText("record changed");
  await page.reload();
  await page
    .getByLabel("Full name", { exact: false })
    .fill("Fictional Browser Officer Updated");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Fictional Browser Officer Updated",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Archive", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to officers" }).click();
  await page.getByRole("textbox", { name: "Search officers" }).fill(tag);
  await expect(
    page.getByRole("link", { name: /Fictional Browser Officer Updated/ }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/officers-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("link", { name: "Archived records", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(
    page.getByRole("heading", { name: "Officers", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await page.screenshot({ path: ".local/officers-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("link", { name: "Account settings", exact: true })
    .click();
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page
    .getByLabel("New password", { exact: true })
    .fill("Fictional-Updated-Browser-Password-2026!");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Fictional-Updated-Browser-Password-2026!");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Fictional-Updated-Browser-Password-2026!");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(
    page.getByRole("heading", { name: "Account settings", exact: true }),
  ).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});
