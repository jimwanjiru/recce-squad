import { test, expect } from "@playwright/test";
import { permissions } from "../../backend/src/config/permissions";
import { workbookValue } from "../src/lib/workbook-format";
test("personnel dates format consistently without completing partial dates", () => {
  for (const value of [
    "2004-02-03T00:00:00.000Z",
    "2004-02-03T00:00:00+00:00",
    " 2004-02-03T00:00:00.000Z ",
  ])
    expect(workbookValue(value, 13)).toBe("3 Feb 2004");
  expect(workbookValue("2007", 14)).toBe("2007");
  expect(workbookValue("2004-02-30", 13)).toBe("2004-02-30");
  expect(workbookValue("  Recorded duty / wording  ", 16)).toBe(
    "  Recorded duty / wording  ",
  );
});
test("officer tabs display all mapped details without a contradictory empty state or duplicate headings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const values: Record<number, string> = {
    2: "FICTION-001",
    3: "000001",
    4: "Cpl/Drv",
    5: "CPL",
    6: "Fictional Profile Officer",
    7: "Fictional ethnicity",
    8: "1980-02-03T00:00:00.000Z",
    9: "Fictional gender",
    10: "Fictional county",
    11: "2000-02-03T00:00:00.000Z",
    12: "Fictional education level",
    13: "2004-02-03T00:00:00.000Z",
    14: "2007",
    15: "2010-02-03T00:00:00.000Z",
    16: "Fictional assigned duty\nRecorded second line",
    17: "Fictional places served",
    18: "Fictional course",
    19: "Fictional formation",
    20: "MO",
    21: "Fictional KCSE grade",
    22: "R",
    23: "Fictional service remarks",
    24: "000002",
    25: "Fictional examination",
    26: "Fictional commendation",
    27: "Fictional phone",
    28: "Fictional disciplinary details",
    29: "Fictional warning",
    30: "Recorded rank duration",
    31: "Recorded service duration",
    32: "Recorded age",
    33: "2035-02-03T00:00:00.000Z",
    34: "Recorded retirement remaining",
    35: "Recorded sub-unit duration",
    36: "FICTIONAL-ACCOUNT",
    37: "Fictional bank",
    38: "Recorded retirement note",
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if (path === "/api/auth/me")
      data = { id: "fiction", name: "Fictional viewer", permissions };
    else if (path === "/api/officers/fiction/personnel-details")
      data = Object.entries(values).map(([column, value]) => ({
        column: Number(column),
        label: "Field " + column,
        value,
      }));
    else if (path === "/api/officers/fiction")
      data = {
        id: "fiction",
        forceNumber: values[2],
        fullName: values[6],
        recordStatus: "ACTIVE",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
        version: 0,
      };
    else if (path.endsWith("/sections/education"))
      data = [
        {
          id: "education",
          educationLevel: values[12],
          kcseGrade: values[21],
          institution: "Recorded fictional institution",
        },
      ];
    else if (path.endsWith("/sections/service"))
      data = {
        id: "service",
        dateJoinedUnit: values[13],
        serviceRemarks: values[23],
      };
    else if (path.includes("/sections/")) data = [];
    else if (path === "/api/officer-options")
      data = {
        ranks: [],
        units: [],
        subUnits: [],
        counties: [],
        ethnicities: [],
      };
    else {
      await route.fulfill({
        status: 404,
        json: { error: { code: "NOT_FOUND" } },
      });
      return;
    }
    await route.fulfill({ json: { data } });
  });
  await page.goto("/officers/fiction");
  const checks: [string, string[]][] = [
    [
      "Service information",
      [
        "3 Feb 2004",
        "3 Feb 2035",
        "Recorded service duration",
        "Fictional service remarks",
      ],
    ],
    [
      "Education",
      [
        "Fictional education level",
        "Fictional KCSE grade",
        "Recorded fictional institution",
      ],
    ],
    [
      "Assignments",
      [
        "2007",
        "Fictional assigned duty",
        "Fictional formation",
        "MO — Main Office",
      ],
    ],
    [
      "Rank history",
      ["Cpl/Drv", "CPL", "3 Feb 2010", "Recorded rank duration"],
    ],
    ["Courses", ["Fictional course"]],
    ["Awards", ["Fictional commendation"]],
    [
      "Disciplinary records",
      ["Fictional disciplinary details", "Fictional warning"],
    ],
    ["Examinations", ["Fictional examination"]],
    ["Financial information", ["FICTIONAL-ACCOUNT", "Fictional bank"]],
    ["Personnel details", ["Recorded age", "000001", "000002"]],
  ];
  for (const [tab, texts] of checks) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    const panel = page.getByRole("tabpanel");
    await expect(
      panel.getByRole("heading", { name: tab, exact: true }),
    ).toHaveCount(1);
    for (const text of texts)
      await expect(
        panel.getByText(text, { exact: !text.includes("assigned duty") }),
      ).toBeVisible();
    await expect(
      panel.getByText("No entries recorded", { exact: true }),
    ).toHaveCount(0);
    await expect(
      panel.getByText(/Original workbook|Mark checked|Needs correction/),
    ).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("tab", { name: "Service information", exact: true })
    .click();
  await expect(
    page.getByRole("tabpanel").getByText("3 Feb 2004", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
