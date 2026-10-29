const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const ExcelJS = require("exceljs");
const { analyze } = require("./analyze-workbook.cjs");
const { validate } = require("./validate-schema.cjs");
test("analysis excludes formatted rows, detects duplicate/missing identifiers and never returns personal values", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "recce-test-"));
  try {
    const w = new ExcelJS.Workbook();
    const s = w.addWorksheet("NAMES");
    s.addRow(["S/NO", "F/NO", "PAYROLL", "RANK", "RANK", "FULL NAMES"]);
    s.addRow([1, "TEST-001", null, "C.I", "CI", "Fictional Alpha"]);
    s.addRow([2, "TEST-001", null, "PC", "PC", "Fictional Beta"]);
    s.addRow([3, null, null, "PC", "PC", "Fictional Gamma"]);
    s.getCell("A100").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFFFF" },
    };
    for (const n of ["TRIBE ", "CHANGES", "SUB UNIT STRENGTH"])
      w.addWorksheet(n);
    const file = path.join(dir, "fixture.xlsx");
    await w.xlsx.writeFile(file);
    const a = await analyze(file);
    assert.equal(a.names.candidateRows, 3);
    assert.equal(a.names.duplicateForce, 1);
    assert.equal(a.names.missingForce, 1);
    assert.equal(a.names.rankDifferences, 1);
    assert.equal(a.sheets[1].name, "TRIBE");
    assert(!JSON.stringify(a).includes("Fictional"));
    assert(!JSON.stringify(a).includes("TEST-001"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("schema includes all proposed entities, restricted relations and integrity keys", async () => {
  const d = await validate();
  const models = d.datamodel.models;
  assert.equal(models.length, 36);
  const officer = models.find((m) => m.name === "Officer");
  assert(officer.fields.find((f) => f.name === "forceNumber").isUnique);
  assert.equal(
    officer.fields.find((f) => f.name === "nationalId").type,
    "String",
  );
  const movement = models.find((m) => m.name === "PersonnelMovement");
  assert(movement.fields.find((f) => f.name === "idempotencyKey").isUnique);
  assert(movement.fields.some((f) => f.name === "appliedAt"));
  for (const m of models)
    for (const f of m.fields.filter((f) => f.relationFromFields?.length))
      assert.equal(f.relationOnDelete, "Restrict");
});

test("migration splitting handles comment and quoted semicolons without truncating SQL", () => {
  const { splitStatements } = require("./sql-statements.cjs");
  assert.deepEqual(
    splitStatements(
      "-- comment; ignore\nINSERT INTO t VALUES ('a;b'); /* comment; */ SELECT `semi;column` FROM t;",
    ),
    ["INSERT INTO t VALUES ('a;b')", "SELECT `semi;column` FROM t"],
  );
  assert.throws(() => splitStatements("SELECT 'unfinished"));
  assert.throws(() => splitStatements("/*! executable */ SELECT 1;"));
});
