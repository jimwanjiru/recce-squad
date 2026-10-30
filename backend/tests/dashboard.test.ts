import { test } from "node:test";
import assert from "node:assert/strict";
import { cachedNumber, tallyOfficer } from "../src/services/dashboard.js";
test("dashboard counts team placement separately from overlapping RECCE membership", () => {
  const counts: Record<string, number> = {};
  assert(tallyOfficer({ 20: "RRT", 22: "R" }, counts));
  assert(!tallyOfficer({ 20: "NA", 22: "" }, counts));
  tallyOfficer({ 20: "GP1", 22: "R" }, counts);
  tallyOfficer({ 20: "Unknown source code", 22: "R" }, counts);
  tallyOfficer({ 20: "", 22: "R" }, counts);
  assert.deepEqual(counts, { RRT: 1, NA: 1, GP1: 1, OTHER: 1, UNSPECIFIED: 1 });
});
test("cached workbook errors and missing totals are unavailable, while real zero remains zero", () => {
  assert.equal(cachedNumber({ formula: "SUM(A1:A2)", result: 0 }), 0);
  assert.equal(
    cachedNumber({ formula: "SUM(A1:A2)", result: { error: "#REF!" } }),
    null,
  );
  assert.equal(cachedNumber(undefined), null);
  assert.equal(cachedNumber(12), 12);
});
