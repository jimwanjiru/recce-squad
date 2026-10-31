import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { createDatabase } from "../../backend/src/config/database";
import { permissions } from "../../backend/src/config/permissions";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("Dedicated test database required");
const db = createDatabase(url),
  tag = "uiorg-" + randomUUID(),
  email = tag + "@example.invalid",
  password = "Fictional-Organization-Browser-2026!";
let userId: string, roleId: string, officerId: string;
test.beforeAll(async () => {
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
        email,
        name: "Fictional Organization Browser",
        passwordHash: await argon2.hash(password),
      },
    })
  ).id;
  await db.userRole.create({ data: { userId, roleId } });
  officerId = (
    await db.officer.create({
      data: {
        forceNumber: tag,
        fullName: "Fictional Structure Officer",
        recordStatus: "UNVERIFIED",
      },
    })
  ).id;
});
test.afterAll(async () => {
  const a = await db.officerAssignment.findMany({
    where: { officerId },
    select: { id: true },
  });
  await db.deploymentRecord.deleteMany({
    where: { assignmentId: { in: a.map((x) => x.id) } },
  });
  await db.officerAssignment.deleteMany({ where: { officerId } });
  await db.officer.delete({ where: { id: officerId } });
  const units = await db.unit.findMany({
      where: { code: { startsWith: tag } },
      select: { id: true },
    }),
    ids = units.map((x) => x.id);
  await db.rankEstablishment.deleteMany({ where: { unitId: { in: ids } } });
  await db.subUnit.deleteMany({ where: { unitId: { in: ids } } });
  await db.unit.deleteMany({ where: { id: { in: ids } } });
  const ranks = await db.rank.findMany({
    where: { code: { startsWith: tag } },
    select: { id: true },
  });
  await db.rankAlias.deleteMany({
    where: { rankId: { in: ranks.map((x) => x.id) } },
  });
  await db.rank.deleteMany({ where: { id: { in: ranks.map((x) => x.id) } } });
  await db.auditLog.deleteMany({ where: { userId } });
  await db.userSession.deleteMany({ where: { userId } });
  await db.userRole.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
  await db.rolePermission.deleteMany({ where: { roleId } });
  await db.role.delete({ where: { id: roleId } });
  await db.$disconnect();
});
test("manage organization references, baseline assignment, deployment and dated establishments", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (e) => runtimeErrors.push(e.name));
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await page.getByRole("link", { name: "Organization", exact: true }).click();
  await page
    .getByRole("tab", { name: "Reference and history", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Organization", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add rank", exact: true }).click();
  await page.getByLabel("Code", { exact: false }).fill(tag + "-R");
  await page
    .getByLabel("Name", { exact: false })
    .fill("Fictional Browser Rank");
  await page.getByLabel("Hierarchy order", { exact: false }).fill("1");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByText(tag + "-R · Fictional Browser Rank", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Units", exact: true }).click();
  await page.getByRole("button", { name: "Add unit", exact: true }).click();
  await page.getByLabel("Code", { exact: false }).fill(tag + "-U");
  await page
    .getByLabel("Name", { exact: false })
    .fill("Fictional Browser Unit");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByText(tag + "-U · Fictional Browser Unit", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sub-units", exact: true }).click();
  await page.getByRole("button", { name: "Add sub-unit", exact: true }).click();
  await page.getByLabel("Code", { exact: false }).fill("FICTIONAL-SUB");
  await page
    .getByLabel("Name", { exact: false })
    .fill("Fictional Browser Sub-unit");
  await page
    .getByLabel(/^Unit(?: \*)?$/)
    .fill(tag + "-U · Fictional Browser Unit");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByText("FICTIONAL-SUB · Fictional Browser Sub-unit", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Assignments", exact: true }).click();
  await page.getByRole("button", { name: "Add baseline" }).click();
  await page.getByLabel("Find officer by name or force number").fill(tag);
  await page
    .getByLabel(/^Officer(?: \*)?$/)
    .fill(tag + " · Fictional Structure Officer");
  await page
    .getByLabel(/^Unit(?: \*)?$/)
    .fill(tag + "-U · Fictional Browser Unit");
  await page
    .getByLabel(/^Sub-unit(?: \*)?$/)
    .fill("FICTIONAL-SUB · Fictional Browser Sub-unit");
  await page
    .getByRole("textbox", { name: /^Effective date/ })
    .fill("2025-01-01");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByText("Fictional Structure Officer", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Deployments", exact: true }).click();
  await page
    .getByRole("button", { name: "Add deployment", exact: true })
    .click();
  await page.getByLabel("Find officer by name or force number").fill(tag);
  await page
    .getByLabel(/^Assignment(?: \*)?$/)
    .fill(
      tag +
        " · Fictional Structure Officer · Fictional Browser Unit / Fictional Browser Sub-unit",
    );
  await page
    .getByLabel("Reviewed deployment classification", { exact: false })
    .fill("FICTIONAL_IN_CAMP");
  await page
    .getByRole("textbox", { name: /^Effective date/ })
    .fill("2025-01-01");
  await page
    .getByLabel("End date", { exact: false })
    .fill("2025-06-01");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByRole("cell", { name: /^FICTIONAL_IN_CAMP/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Establishments", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record approved establishment" })
    .click();
  await page
    .getByLabel(/^Unit(?: \*)?$/)
    .fill(tag + "-U · Fictional Browser Unit");
  await page
    .getByLabel(/^Sub-unit(?: \*)?$/)
    .fill("FICTIONAL-SUB · Fictional Browser Sub-unit");
  await page
    .getByLabel(/^Rank(?: \*)?$/)
    .fill(tag + "-R · Fictional Browser Rank");
  await page
    .getByLabel("Approved authorized strength", { exact: false })
    .fill("12");
  await page
    .getByRole("textbox", { name: /^Effective date/ })
    .fill("2025-01-01");
  await page
    .getByLabel("End date", { exact: false })
    .fill("2026-01-01");
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Save record" }).click();
  await page.getByLabel("Reporting date").fill("2025-06-01");
  await expect(
    page.getByRole("cell", { name: "12", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/organization-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByLabel("Reporting date").fill("2026-06-01");
  await expect(
    page.getByRole("heading", { name: "No matching organization records" }),
  ).toBeVisible();
  await page.getByLabel("Reporting date").fill("2025-06-01");
  await expect(
    page.getByRole("cell", { name: "12", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await page.screenshot({
    path: ".local/organization-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(runtimeErrors).toEqual([]);
});
