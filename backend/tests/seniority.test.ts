import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSeniority } from "../src/services/seniority.js";
test("seniority places configured CO first, orders numeric identifiers without precision loss, and never changes ranks", () => {
  const rows = [
    { id: "a", forceNumber: "100", rank: "Source rank A" },
    { id: "b", forceNumber: "90", rank: "Source rank B" },
    { id: "c", forceNumber: "200", rank: "Source CO rank" },
    { id: "d", forceNumber: "9007199254740993", rank: "Source rank D" },
    { id: "e", forceNumber: "9007199254740992", rank: "Source rank E" },
  ];
  const before = JSON.stringify(rows);
  assert.deepEqual(
    [...rows].sort((a, b) => compareSeniority(a, b, "200")).map((o) => o.id),
    ["c", "b", "a", "e", "d"],
  );
  assert.equal(JSON.stringify(rows), before);
});

import { checkSourceOfficer } from "../src/services/workbook-source.js";
test("source identity checks reject mismatched force numbers and respect explicit zero-padding formats", () => {
  assert.throws(
    () =>
      checkSourceOfficer(
        { 2: "FICTIONAL-WRONG" },
        { forceNumber: "FICTIONAL-RIGHT" },
      ),
    /WORKBOOK_OFFICER_IDENTITY_MISMATCH/,
  );
  assert.doesNotThrow(() =>
    checkSourceOfficer(
      { 2: 7, _numberFormats: { 2: "0000" } },
      { forceNumber: "0007" },
    ),
  );
});
