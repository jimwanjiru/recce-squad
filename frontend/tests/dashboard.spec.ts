import { test, expect } from "@playwright/test";
import { dashboardNumber, dashboardGap } from "../src/lib/dashboard-numbers";

test("missing numeric metrics remain unavailable while zero and signed gaps format correctly", () => {
  for (const value of [undefined, null, NaN, Infinity, "12", {}]) {
    expect(dashboardNumber(value)).toBe("Unavailable");
    expect(dashboardGap(value)).toBe("Unavailable");
  }
  expect(dashboardNumber(0)).toBe("0");
  expect(dashboardNumber(1492)).toBe("1,492");
  expect(dashboardGap(2)).toBe("+2");
  expect(dashboardGap(-2)).toBe("-2");
});

for (const complete of [false, true]) {
  test(`strength tabs render ${complete ? "complete zero metrics" : "an older response with missing metrics"} without a blank page`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown;
      if (path === "/api/auth/me")
        body = {
          data: {
            id: "fictional",
            name: "Fictional Dashboard User",
            email: "dashboard@example.invalid",
            permissions: [
              "reports.view",
              "officers.view",
              "fields.import_source.view",
              "fields.assignments.view",
              "fields.service_profile.view",
              "fields.rank_history.view",
            ],
          },
        };
      else if (path === "/api/dashboard")
        body = {
          data: {
            totalOfficers: 0,
            archivedOfficers: 0,
            formerOfficers: 0,
            needsVerification: 0,
            recce: 0,
            sourceLinked: 0,
            withoutSource: 0,
            identityMismatches: 0,
            currentRankOrder: ["CPL"],
            generatedAt: "2026-10-31T00:00:00Z",
            groups: [
              {
                code: "MO",
                label: "Main Office",
                count: 0,
                inStrengthSheet: true,
                ...(complete ? { ranks: { CPL: 0 }, workbookCached: 0 } : {}),
              },
            ],
            rankBreakdown: [
              {
                code: "CPL",
                label: "CPL",
                count: 0,
                ...(complete
                  ? {
                      recceCount: 0,
                      workbookCurrent: 0,
                      workbookEstablishment: 0,
                      differenceToEstablishment: 0,
                    }
                  : {}),
              },
            ],
            workbook: complete
              ? { importedAt: "2026-10-31T00:00:00Z", total: 0, recce: 0 }
              : null,
          },
        };
      else if (path === "/api/personnel-summaries")
        body = { data: [], meta: { total: 0 } };
      else {
        await route.fulfill({
          status: 404,
          json: { error: { code: "NOT_FOUND" } },
        });
        return;
      }
      await route.fulfill({ json: body });
    });
    await page.goto("/dashboard");
    await page
      .getByRole("tab", { name: "Strength analysis", exact: true })
      .click();
    const table = page.getByRole("table", {
      name: "Rank strength and establishment comparison",
      exact: true,
    });
    await expect(table).toBeVisible();
    if (!complete)
      await expect(
        table.getByText("Unavailable", { exact: true }).first(),
      ).toBeVisible();
    else
      await expect(
        table.getByText("Unavailable", { exact: true }).first(),
      ).toHaveCount(0);
    await page
      .getByRole("tab", { name: "Strength comparison", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Sub-unit strength comparison",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}
