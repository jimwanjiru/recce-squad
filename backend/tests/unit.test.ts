import { test } from "node:test";
import assert from "node:assert/strict";
import { overlaps, verifiedDate } from "../src/services/history.js";
import { retirementRule, strengthDecision } from "../src/services/policies.js";
import {
  permittedOfficerSelect,
  permissions,
} from "../src/config/permissions.js";
const d = (x: string) => verifiedDate(x);
test("calendar dates reject incomplete and rolled-over history dates", () => {
  for (const invalid of ["2026-02", "2026-02-30", "2026-13-01", "unknown"])
    assert.throws(() => d(invalid));
  assert.equal(d("2024-02-29").toISOString().slice(0, 10), "2024-02-29");
});
test("history uses half-open intervals and permits adjacent records", () => {
  const a = { effectiveFrom: d("2025-01-01"), effectiveTo: d("2026-01-01") };
  assert.equal(
    overlaps(a, { effectiveFrom: d("2026-01-01"), effectiveTo: null }),
    false,
  );
  assert.equal(
    overlaps(a, { effectiveFrom: d("2025-12-31"), effectiveTo: null }),
    true,
  );
});
test("retirement prefers approved rank rules, falls back to general, rejects unconfigured/ambiguous policy", () => {
  const general = {
    rankId: null,
    retirementAge: 60,
    effectiveFrom: d("2020-01-01"),
    effectiveTo: null,
    isActive: true,
    approvedAt: d("2020-01-01"),
    approvedById: "fictional-reviewer",
  };
  const rank = { ...general, rankId: "fictional-rank", retirementAge: 65 };
  assert.equal(
    retirementRule([general, rank], "fictional-rank", d("2026-01-01"))
      .retirementAge,
    65,
  );
  assert.equal(
    retirementRule([general, rank], "other", d("2026-01-01")).retirementAge,
    60,
  );
  assert.throws(() =>
    retirementRule([{ ...general, isActive: false }], "other", d("2026-01-01")),
  );
  assert.throws(() =>
    retirementRule([general, general], "other", d("2026-01-01")),
  );
  assert.throws(() => retirementRule([general], "other", d("2019-01-01")));
});
test("nominal and operational strength are independent and default to unconfigured", () => {
  const rule = {
    status: "FICTIONAL",
    deploymentStatus: "*",
    includeNominal: true,
    includeOperational: false,
    effectiveFrom: d("2025-01-01"),
    effectiveTo: null,
    isActive: true,
    approvedAt: d("2025-01-01"),
    approvedById: "fictional",
  };
  assert.deepEqual(
    strengthDecision([rule], "FICTIONAL", "DETACHED", d("2026-01-01")),
    { nominal: true, operational: false },
  );
  assert.throws(() =>
    strengthDecision([], "FICTIONAL", "PRESENT", d("2026-01-01")),
  );
  assert.throws(() =>
    strengthDecision(
      [{ ...rule, approvedAt: null }],
      "FICTIONAL",
      "PRESENT",
      d("2026-01-01"),
    ),
  );
});
test("sensitive field reads, writes and exports need independent permissions", () => {
  const safe = permittedOfficerSelect(new Set(["officers.view"]));
  assert(!safe.nationalId && !safe.ethnicityId && !safe.phone);
  assert(
    permittedOfficerSelect(new Set(["fields.national_id.view"])).nationalId,
  );
  assert(
    !permittedOfficerSelect(new Set(["fields.national_id.view"]), "export")
      .nationalId,
  );
  assert(
    permittedOfficerSelect(
      new Set(["fields.national_id.view", "fields.national_id.export"]),
      "export",
    ).nationalId,
  );
  assert(permissions.includes("fields.disciplinary_records.write"));
  assert(permissions.includes("fields.financial_details.view"));
  assert(!safe.importRows);
});
