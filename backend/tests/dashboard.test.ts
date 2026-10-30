import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentPoliceRanks,
  overallRank,
  sortRankReferences,
} from "../src/services/ranks.js";
import {
  policeRanks,
  sourceRank,
  strengthRankColumns,
  cachedNumber,
  tallyOfficer,
} from "../src/services/dashboard.js";
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

test("historical strength retains all 13 source ranks and preserves unmapped specialist source values", () => {
  assert.deepEqual(policeRanks, [
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
  ]);
  assert.equal(sourceRank("C.I"), "CI");
  assert.equal(sourceRank("S/Sgt"), "S/SGT");
  assert.equal(sourceRank("Cpl"), "CPL");
  assert.equal(sourceRank("PC specialist"), "UNKNOWN");
  assert.equal(sourceRank(""), "UNKNOWN");
  assert.equal(strengthRankColumns["RSM"], 24);
  assert.equal(strengthRankColumns["PC"], 36);
});

test("current rank order is independent of specialist spelling and historical strength columns", () => {
  assert.deepEqual(currentPoliceRanks, [
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
  ]);
  assert.equal(overallRank("ASP."), "ASP");
  assert.equal(overallRank("C.I."), "CI");
  assert.notEqual(overallRank("CP"), overallRank("Cpl"));
  assert.equal(overallRank("Cpl/Drv"), "UNKNOWN"); // Rank 2, not arbitrary Rank 1 text, is authoritative.
  assert.deepEqual(
    sortRankReferences([
      { code: "PC", hierarchyLevel: 1 },
      { code: "CP", hierarchyLevel: 99 },
      { code: "CPL", hierarchyLevel: 2 },
    ]).map((r) => r.code),
    ["CP", "CPL", "PC"],
  );
});
