import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import argon2 from "argon2";
import { createDatabase } from "../../backend/src/config/database";
import { permissions } from "../../backend/src/config/permissions";
import { seal } from "../../tools/workbook-import-data.cjs";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("Dedicated test database required");
const db = createDatabase(url),
  tag = "change-ui-" + randomUUID(),
  password = "Fictional-Change-UI-Password-2026!",
  email = tag + "@example.invalid",
  reviewEmail = tag + "-review@example.invalid";
let userId = "",
  roleId = "",
  officerId = "",
  retiredOfficerId = "",
  batchId = "",
  approverRoleExisted = false;
const year = Number(
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      timeZone: "Africa/Nairobi",
    }).format(new Date()),
  ),
  past = year - 1;
test.beforeAll(async () => {
  approverRoleExisted = !!(await db.role.findUnique({
    where: { name: "Personnel Change Approver" },
  }));
  await mkdir(".local", { recursive: true });
  try {
    await writeFile(".local/browser-source.key", randomBytes(32), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;
  }
  const key = await readFile(".local/browser-source.key");
  roleId = (await db.role.create({ data: { name: tag } })).id;
  for (const code of permissions) {
    const p = await db.permission.upsert({
      where: { code },
      create: { code, description: code },
      update: {},
    });
    await db.rolePermission.create({ data: { roleId, permissionId: p.id } });
  }
  userId = (
    await db.user.create({
      data: {
        name: "Fictional Changes UI Recorder",
        email,
        passwordHash: await argon2.hash(password),
        roles: { create: { roleId } },
      },
    })
  ).id;
  const officer = await db.officer.create({
    data: {
      forceNumber: tag,
      fullName: "Fictional Change UI Officer",
      recordStatus: "ACTIVE",
    },
  });
  officerId = officer.id;
  retiredOfficerId = (
    await db.officer.create({
      data: {
        forceNumber: tag + "-retired",
        fullName: "Fictional Retired UI Officer",
        recordStatus: "RETIRED",
        dateOfBirth: new Date("1960-04-20T00:00:00Z"),
        phone: "FICTIONAL_PHONE",
      },
    })
  ).id;
  const retirementId = randomUUID();
  await db.officerChange.create({
    data: {
      id: retirementId,
      officerId: retiredOfficerId,
      recordedById: userId,
      eventType: "RETIREMENT",
      effectiveDate: new Date(`${past - 1}-06-01T00:00:00Z`),
      workbookCells: seal(
        {
          "2": tag + "-retired",
          "3": "C.I(W)",
          "4": "CI",
          "5": "Fictional Retired UI Officer",
          "8": `${past - 1}-06-01`,
          "9": "FICTIONAL_RETIREMENT_REFERENCE",
        },
        key,
        "changes:" + retirementId,
      ),
    },
  });
  batchId = (
    await db.importBatch.create({
      data: {
        filename: "Fictional Changes UI",
        fileSha256: tag,
        uploadedById: userId,
        status: "CORE_IMPORTED_REVIEW_PENDING",
      },
    })
  ).id;
  await db.importRow.create({
    data: {
      batchId,
      sheetName: "CHANGES",
      rowNumber: 6,
      rawData: seal(
        {
          1: "1",
          2: tag,
          3: "PC",
          5: officer.fullName,
          7: "HQS",
          38: "FICTIONAL_LEGACY_LAST_COLUMN",
        },
        key,
        `${tag}:CHANGES:6`,
      ),
      unresolvedDates: {},
      validationErrors: [],
    },
  });
});
test.afterAll(async () => {
  const officerFilter = {
    officerId: { in: [officerId, retiredOfficerId].filter(Boolean) },
  };
  const text = await readFile(
      "backend/prisma/migrations/20261030120000_officer_changes/migration.sql",
      "utf8",
    ),
    guard = text.match(
      /CREATE TRIGGER `OfficerChange_applied_delete_guard`[\s\S]*?END;/,
    )![0];
  await db.$executeRawUnsafe(
    "DROP TRIGGER IF EXISTS OfficerChange_applied_delete_guard",
  );
  try {
    const rows = await db.officerChange.findMany({
      where: officerFilter,
      select: { id: true, amendsId: true },
    });
    while (rows.length) {
      const index = rows.findIndex(
        (r) => !rows.some((c) => c.amendsId === r.id),
      );
      const [row] = rows.splice(index, 1);
      await db.officerChange.delete({ where: { id: row!.id } });
    }
  } finally {
    await db.$executeRawUnsafe(guard);
  }
  await db.officerStatusHistory.deleteMany({ where: officerFilter });
  await db.personnelMovement.deleteMany({ where: officerFilter });
  await db.officerAssignment.deleteMany({ where: officerFilter });
  await db.officerRankHistory.deleteMany({ where: officerFilter });
  await db.importRow.deleteMany({ where: { batchId } });
  if (batchId) await db.importBatch.delete({ where: { id: batchId } });
  if (officerId) await db.officer.delete({ where: { id: officerId } });
  if (retiredOfficerId)
    await db.officer.delete({ where: { id: retiredOfficerId } });
  const users = await db.user.findMany({
      where: { email: { in: [email, reviewEmail] } },
      select: { id: true },
    }),
    ids = users.map((u) => u.id);
  await db.auditLog.deleteMany({ where: { userId: { in: ids } } });
  await db.userSession.deleteMany({ where: { userId: { in: ids } } });
  await db.userRole.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.rolePermission.deleteMany({ where: { roleId } });
  if (roleId) await db.role.delete({ where: { id: roleId } });
  if (!approverRoleExisted) {
    const role = await db.role.findUnique({
      where: { name: "Personnel Change Approver" },
    });
    if (role) {
      await db.rolePermission.deleteMany({ where: { roleId: role.id } });
      await db.role.delete({ where: { id: role.id } });
    }
  }
  await db.$disconnect();
});
test("record, edit, delete and independently approve officer changes without mixing effective years or omitting workbook columns", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.name));
  await page.goto("/changes");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(
    page.getByRole("heading", { name: "Changes", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record change", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Officer change record",
    exact: true,
  });
  await dialog.getByLabel("Find existing officer", { exact: true }).fill(tag);
  await expect(
    dialog.getByRole("option", {
      name: tag + " · Fictional Change UI Officer",
      exact: true,
    }),
  ).toBeAttached();
  await dialog
    .getByLabel("Select existing officer", { exact: true })
    .selectOption(officerId);
  await dialog
    .getByLabel("Change effective date", { exact: true })
    .fill(`${past}-07-01`);
  await dialog.getByLabel("Sub-unit", { exact: true }).fill("HQS");
  await dialog
    .getByLabel("Transferred to", { exact: true })
    .fill("FICTIONAL_UI_LAST_COLUMN");
  await expect(dialog.locator("textarea")).toHaveCount(13);
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Changes in " + past, exact: true }),
  ).toBeVisible();
  let table = page.getByRole("table", {
    name: "Personnel changes table",
    exact: true,
  });
  await expect(
    page.getByLabel("Change type filter", { exact: true }),
  ).toBeVisible();
  await expect(table.getByRole("columnheader")).toHaveCount(17);
  await expect(
    table.getByRole("columnheader", { name: "Event", exact: true }),
  ).toHaveCount(0);
  await expect(
    table.getByRole("columnheader", { name: "Change type", exact: true }),
  ).toHaveCount(1);
  await table.getByRole("button", { name: "View", exact: true }).click();
  let details = page.getByRole("dialog", {
    name: "Officer change details",
    exact: true,
  });
  await expect(details.locator("section").first()).toHaveAttribute(
    "aria-label",
    "Recorded change details",
  );
  await expect(details.locator("details[open]")).toHaveCount(0);
  await expect(
    details.getByRole("region", { name: "Officer details", exact: true }),
  ).toBeHidden();
  await expect(
    details
      .getByRole("region", { name: "Recorded change details", exact: true })
      .locator("dl > div"),
  ).toHaveCount(13);
  await expect(
    details.getByText("FICTIONAL_UI_LAST_COLUMN", { exact: true }),
  ).toBeVisible();
  await expect(details.locator("input, textarea, select")).toHaveCount(0);
  await expect(
    details.getByRole("button", { name: "Save draft", exact: true }),
  ).toHaveCount(0);
  await details.getByRole("button", { name: "Close", exact: true }).click();
  await table.getByRole("button", { name: "Edit", exact: true }).click();
  dialog = page.getByRole("dialog", {
    name: "Officer change record",
    exact: true,
  });
  await dialog
    .getByLabel("Transferred to", { exact: true })
    .fill("FICTIONAL_UI_EDITED_LAST_COLUMN");
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    table.getByText("FICTIONAL_UI_EDITED_LAST_COLUMN", { exact: true }),
  ).toBeAttached();
  await page
    .getByLabel("Change effective year", { exact: true })
    .selectOption(String(year));
  await expect(
    page.getByText("No changes in this year or filter.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Change effective year", { exact: true })
    .selectOption(String(past));
  await expect(
    table.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record change", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Officer change record",
    exact: true,
  });
  await dialog.getByLabel("Find existing officer", { exact: true }).fill(tag);
  await dialog
    .getByLabel("Select existing officer", { exact: true })
    .selectOption(officerId);
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Undated review queue", exact: true }),
  ).toBeVisible();
  await table
    .getByRole("button", { name: "Delete draft", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByText("No changes in this year or filter.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Change effective year", { exact: true })
    .selectOption(String(past));
  await table.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    table.getByRole("button", { name: "Approve and apply", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Set up approver", exact: true })
    .click();
  const setup = page.getByRole("dialog", {
    name: "Set up change approver",
    exact: true,
  });
  await setup.getByLabel("Name", { exact: true }).fill("Fictional UI Reviewer");
  await setup.getByLabel("Email", { exact: true }).fill(reviewEmail);
  await setup
    .getByLabel("Password (14+ characters)", { exact: true })
    .fill(password);
  await setup
    .getByRole("button", { name: "Create approver", exact: true })
    .click();
  await expect(setup.getByRole("status")).toContainText(
    "Approver account created",
  );
  await setup.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Email address").fill(reviewEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(
    page.getByRole("heading", { name: "Changes", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Change effective year", { exact: true })
    .selectOption(String(past));
  await table
    .getByRole("button", { name: "Approve and apply", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(table.getByText("APPLIED", { exact: true })).toBeVisible();
  await expect(
    table.getByRole("button", { name: "Delete draft", exact: true }),
  ).toHaveCount(0);
  const officer = await db.officer.findUniqueOrThrow({
    where: { id: officerId },
  });
  expect(officer.recordStatus).toBe("TRANSFERRED_OUT");
  expect(officer.deletedAt).toBeNull();
  await table.getByRole("button", { name: "View", exact: true }).click();
  details = page.getByRole("dialog", {
    name: "Officer change details",
    exact: true,
  });
  await expect(details.locator("details[open]")).toHaveCount(0);
  await expect(details.getByText("APPLIED", { exact: true })).toBeVisible();
  await details.getByText("Officer details", { exact: true }).click();
  await expect(
    details.getByText("TRANSFERRED OUT", { exact: true }),
  ).toBeVisible();
  await details
    .getByText("Approval and recording details", { exact: true })
    .click();
  await expect(
    details.getByText("Fictional UI Reviewer", { exact: true }),
  ).toBeVisible();
  await expect(
    details.getByText("FICTIONAL_UI_EDITED_LAST_COLUMN", { exact: true }),
  ).toBeVisible();
  await expect(
    details.getByRole("link", {
      name: "Open full officer record",
      exact: true,
    }),
  ).toHaveAttribute("href", "/officers/" + officerId);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await details.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  await expect(
    table.getByRole("button", { name: "View", exact: true }),
  ).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: ".local/changes-register-layout.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.getByRole("tab", { name: "Workbook source", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Change effective year", { exact: true })
    .selectOption(String(past - 1));
  await page
    .getByLabel("Change type filter", { exact: true })
    .selectOption("RETIREMENT");
  await table.getByRole("button", { name: "View", exact: true }).click();
  details = page.getByRole("dialog", {
    name: "Officer change details",
    exact: true,
  });
  await expect(
    details.getByText("FICTIONAL_RETIREMENT_REFERENCE", { exact: true }),
  ).toBeVisible();
  const officerToggle = details.getByText("Officer details", { exact: true });
  await officerToggle.focus();
  await officerToggle.press("Enter");
  const identity = details.getByRole("region", {
    name: "Officer details",
    exact: true,
  });
  await expect(identity.getByText("RETIRED", { exact: true })).toBeVisible();
  await expect(
    identity.getByText("20 Apr 1960", { exact: true }),
  ).toBeVisible();
  await expect(
    identity.getByText("FICTIONAL_PHONE", { exact: true }),
  ).toBeVisible();
  await expect(
    details.getByText("FICTIONAL_RETIREMENT_REFERENCE", { exact: true }),
  ).toBeVisible();
  await details
    .getByRole("link", { name: "Open full officer record", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp("/officers/" + retiredOfficerId + "$"),
  );
  await expect(
    page.getByRole("heading", {
      name: "Fictional Retired UI Officer",
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
