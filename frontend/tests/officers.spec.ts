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
  await expect(page.getByLabel("Officer order", { exact: true })).toHaveValue(
    "rank",
  );
  await expect(
    page.getByLabel("Rank filter", { exact: true }).locator("option"),
  ).toHaveText([
    "All ranks",
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
    "Unmapped / not recorded",
  ]);
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
          5: "C.I",
          8: "1990-02-03T00:00:00.000Z",
          13: "2007",
          20: "MO",
          22: "R",
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
  const otherGroupOfficer = await db.officer.create({
    data: {
      forceNumber: tag + "-other",
      fullName: "Fictional HQS Officer",
      recordStatus: "UNVERIFIED",
    },
  });
  await db.importRow.create({
    data: {
      batchId: batch.id,
      sheetName: "NAMES",
      rowNumber: 3,
      officerId: otherGroupOfficer.id,
      rawData: seal(
        {
          2: otherGroupOfficer.forceNumber,
          6: otherGroupOfficer.fullName,
          4: "PC",
          5: "PC",
          20: "HQS",
          22: "R",
        },
        sourceKey,
        `${tag}:NAMES:3`,
      ),
      unresolvedDates: {},
      validationErrors: [],
      status: "CORE_IMPORTED_REVIEW_PENDING",
    },
  });
  await db.importBatch.update({
    where: { id: batch.id },
    data: { totalRows: 2, importedRows: 2 },
  });
  await db.importRow.create({
    data: {
      batchId: batch.id,
      sheetName: "SUB UNIT STRENGTH",
      rowNumber: 8,
      rawData: seal(
        { 1: "MO", 37: { formula: 'COUNTIF(NAMES!T:T,"MO")', result: 99 } },
        sourceKey,
        `${tag}:SUB UNIT STRENGTH:8`,
      ),
      unresolvedDates: {},
      validationErrors: [],
      status: "SOURCE_ONLY",
    },
  });
  for (const [rowNumber, raw] of [
    [23, { 1: "Current Strength", 20: { formula: "T19", result: 1 } }],
    [24, { 1: "Establishment", 20: 2 }],
  ] as const) {
    await db.importRow.create({
      data: {
        batchId: batch.id,
        sheetName: "SUB UNIT STRENGTH",
        rowNumber,
        rawData: seal(raw, sourceKey, `${tag}:SUB UNIT STRENGTH:${rowNumber}`),
        unresolvedDates: {},
        validationErrors: [],
        status: "SOURCE_ONLY",
      },
    });
  }
  await page
    .getByRole("tab", { name: "Workbook details", exact: true })
    .click();
  await expect(
    page.getByText("Fictional Specialist Designation", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("FICTIONAL_BANK_SOURCE", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("3 Feb 1990", { exact: true })).toBeVisible();
  await expect(
    page.getByText("1990-02-03T00:00:00.000Z", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("2007", { exact: true })).toBeVisible();
  await expect(
    page.getByText("MO — Main Office", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("R — Recce", { exact: true })).toBeVisible();
  const tabsBox = await page
    .getByRole("tablist", { name: "Officer profile sections" })
    .boundingBox();
  const panelBox = await page.getByRole("tabpanel").boundingBox();
  expect(tabsBox!.y + tabsBox!.height).toBeLessThanOrEqual(panelBox!.y);
  await page.screenshot({ path: ".local/workbook-profile-layout.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page
    .getByRole("button", { name: "Mark checked", exact: true })
    .first()
    .click();
  await expect(page.getByText(/Source checked ·/)).toBeVisible();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  const expectedRegisterTotal = await db.officer.count({
    where: { deletedAt: null },
  });
  await expect(
    page
      .locator(".dashboard-stat")
      .filter({ hasText: "Total officers" })
      .locator("strong"),
  ).toHaveText(expectedRegisterTotal.toLocaleString("en-GB"));
  await expect(
    page
      .locator(".dashboard-group")
      .filter({ hasText: "Main Office" })
      .locator("strong"),
  ).toHaveText("1");
  await expect(
    page.getByText("FICTIONAL_BANK_SOURCE", { exact: true }),
  ).toHaveCount(0);
  const composition = page.getByRole("region", {
    name: "Rank composition",
    exact: true,
  });
  await page
    .getByLabel("Rank composition group", { exact: true })
    .selectOption("ALL");
  await expect(composition.locator(".rank-chart-row")).toHaveCount(2);
  await expect(
    composition.locator(".rank-chart-row").filter({ hasText: "CI" }),
  ).toContainText("50.0%");
  await page
    .getByLabel("Rank composition group", { exact: true })
    .selectOption("HQS");
  await expect(composition.locator(".rank-chart-row")).toHaveCount(1);
  await expect(composition.locator(".rank-chart-row")).toContainText("PC");
  await expect(composition.locator(".rank-chart-row")).toContainText("100.0%");
  await page
    .getByLabel("Rank composition group", { exact: true })
    .selectOption("RRT");
  await expect(
    composition.getByText("No officers are recorded in this group.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .locator(".distribution-legend")
    .getByRole("button", { name: /Main Office/ })
    .click();
  await expect(
    page.getByRole("link", { name: "View Main Office roster →", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".local/analytics-overview-layout.png" });
  await page
    .getByRole("tab", { name: "Strength analysis", exact: true })
    .click();
  const matrix = page.getByRole("table", {
    name: "Sub-unit strength by police rank",
    exact: true,
  });
  for (const rank of [
    "S/AIG",
    "AIG",
    "CP",
    "SSP",
    "SP",
    "ASP",
    "CI",
    "IP",
    "RSM",
    "S/SGT",
    "SGT",
    "CPL",
    "PC",
  ])
    await expect(
      matrix.getByRole("columnheader", { name: rank, exact: true }),
    ).toBeVisible();
  const comparison = page.getByRole("table", {
    name: "Rank strength and establishment comparison",
    exact: true,
  });
  await expect(
    comparison.getByRole("row").filter({
      has: page.getByRole("rowheader", { name: "CI", exact: true }),
    }),
  ).toContainText("+1");
  await page.screenshot({ path: ".local/dashboard-layout.png" });
  await page
    .getByRole("navigation", { name: "Rank matrix pagination", exact: true })
    .getByRole("button", { name: "Next", exact: true })
    .click();
  await expect(
    matrix.getByRole("rowheader", { name: "GP3", exact: true }),
  ).toBeVisible();
  await matrix.scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".local/rank-strength-layout.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/organization?view=groups&group=MO");
  await expect(
    page
      .getByRole("table", { name: "Group officer roster", exact: true })
      .getByRole("link", { name: "Fictional Browser Officer", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: "Group officer roster", exact: true })
      .getByText("CI", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Filter roster by rank", { exact: true })
    .selectOption("PC");
  await expect(
    page.getByText("No officers match this group and filter.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Filter roster by rank", { exact: true })
    .selectOption("CI");
  await expect(
    page
      .getByRole("table", { name: "Group officer roster", exact: true })
      .getByRole("link", { name: "Fictional Browser Officer", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".local/group-roster-layout.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/officers");
  await expect(
    page.getByRole("columnheader", {
      name: "Rank 1 · rank / specialization",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", {
      name: "Rank 2 · overall rank",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Rank filter", { exact: true }).selectOption("CI");
  await expect(
    page
      .getByRole("table")
      .getByText("Fictional Specialist Designation", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByText("PC", { exact: true }),
  ).toHaveCount(0);
  await page.goto("/officers/" + sourceOfficerId);

  await page.getByRole("tab", { name: "Rank history", exact: true }).click();
  await expect(
    page.getByText("Fictional Specialist Designation", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("FICTIONAL_BANK_SOURCE", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("tab", { name: "Financial information", exact: true })
    .click();
  await expect(
    page.getByText("FICTIONAL_BANK_SOURCE", { exact: true }),
  ).toBeVisible();
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
