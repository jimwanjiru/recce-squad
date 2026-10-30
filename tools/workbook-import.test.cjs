const { test } = require("node:test"),
  assert = require("node:assert/strict");
const ExcelJS = require("exceljs"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { readWorkbook, calendar, seal } = require("./workbook-import-data.cjs");
async function fixture(file) {
  const w = new ExcelJS.Workbook(),
    s = w.addWorksheet("NAMES");
  for (const [c, h] of [
    [2, "F/NO"],
    [4, "RANK"],
    [5, "RANK"],
    [6, "FULL NAMES"],
    [8, "FULL DATE OF BIRTH"],
    [11, "DATE OF ENLIST"],
    [24, "ID. NO"],
    [27, "PHONE NO."],
  ])
    s.getCell(1, c).value = h;
  function row(n, force) {
    s.getCell(n, 2).value = force;
    s.getCell(n, 6).value = "Fictional Import Officer " + n;
    s.getCell(n, 4).value = "Unmapped Specialist Rank";
    s.getCell(n, 5).value = "Unapproved Code";
  }
  row(2, "TEST-IMPORT-A");
  s.getCell(2, 8).value = new Date("1990-02-03T00:00:00Z");
  s.getCell(2, 11).value = "2012-03-04";
  s.getCell(2, 12).value = "Fictional education";
  s.getCell(2, 24).value = 7;
  s.getCell(2, 24).numFmt = "000000";
  s.getCell(2, 27).value = 1.5;
  s.getCell(2, 36).value = "FICTIONAL-ACCOUNT-SECRET";
  row(3, "TEST-IMPORT-B");
  s.getCell(3, 8).value = "1992";
  s.getCell(3, 14).value = "2007";
  row(4, "TEST-IMPORT-DUP");
  row(5, "test-import-dup");
  row(6, null);
  row(7, "TEST-IMPORT-C");
  s.getCell(7, 8).value = "2025-01-01";
  s.getCell(7, 11).value = "2000-01-01";
  s.getCell(2, 5).value = "C.I";
  s.getCell(3, 5).value = "PC";
  s.getCell(7, 5).value = "Unmapped specialist";
  s.getCell(2, 20).value = "MO";
  s.getCell(2, 22).value = "R";
  const strength = w.addWorksheet("SUB UNIT STRENGTH");
  strength.getCell("A5").value = "R";
  strength.getCell("AK5").value = {
    formula: 'COUNTIF(NAMES!V2:V7,"R")',
    result: 1,
  };
  strength.getCell("A8").value = "MO";
  strength.getCell("AK8").value = {
    formula: 'COUNTIF(NAMES!T2:T7,"MO")',
    result: 99,
  };
  strength.getCell("A19").value = "TOTAL";
  strength.getCell("AK19").value = { formula: "SUM(AK8:AK18)", result: 99 };
  w.addWorksheet("CHANGES").addRow(["Fictional historical source", "2001"]);
  strength.getCell("A23").value = "Current Strength";
  strength.getCell("T23").value = { formula: "T19", result: 1 };
  strength.getCell("AJ23").value = {
    formula: "AJ19",
    result: { error: "#REF!" },
  };
  strength.getCell("A24").value = "Establishment";
  strength.getCell("T24").value = 2;
  strength.getCell("AJ24").value = 0;
  await w.xlsx.writeFile(file);
}
test("workbook preview preserves source, holds partial dates and duplicates, and never turns histories into effective dates", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "recce-import-"));
  try {
    const file = path.join(dir, "fictional.xlsx");
    await fixture(file);
    const result = await readWorkbook(file);
    assert.equal(result.summary.candidateOfficers, 6);
    assert.equal(result.summary.eligibleOfficers, 3);
    assert.equal(result.summary.heldOfficers, 3);
    const a = result.rows.find((r) => r.row === 2 && r.sheet === "NAMES");
    assert.equal(
      a.candidate.data.dateOfBirth.toISOString(),
      "1990-02-03T00:00:00.000Z",
    );
    assert.equal(a.originalRank, "Unmapped Specialist Rank");
    assert.equal(a.candidate.data.nationalId, "000007");
    assert.equal(a.candidate.data.phone, undefined);
    assert(a.errors.includes("UNSAFE_NUMERIC_IDENTIFIER_COLUMN_27"));
    assert.equal(a.raw._numberFormats[24], "000000");
    assert(!("rankHistories" in a.candidate.data));
    const b = result.rows.find((r) => r.row === 3 && r.sheet === "NAMES");
    assert.equal(b.candidate.data.dateOfBirth, undefined);
    assert.equal(b.dates[14], "2007");
    const c = result.rows.find((r) => r.row === 7 && r.sheet === "NAMES");
    assert.equal(c.candidate.data.dateEnlisted, undefined);
    assert(!JSON.stringify(result.summary).includes("Fictional"));
    const key = crypto.randomBytes(32),
      context = "test:row",
      encrypted = seal(a.raw, key, context);
    assert(!JSON.stringify(encrypted).includes("FICTIONAL-ACCOUNT-SECRET"));
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(encrypted.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
    assert.equal(
      JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
          decipher.final(),
        ]).toString(),
      )[36],
      "FICTIONAL-ACCOUNT-SECRET",
    );
    assert.equal(calendar({ value: "2023-02-29" }), null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
module.exports = { fixture };

test("typed dates honor the workbook 1904 date system", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "recce-import-1904-"));
  try {
    const file = path.join(dir, "fictional.xlsx");
    await fixture(file);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    wb.properties.date1904 = true;
    await wb.xlsx.writeFile(file);
    const result = await readWorkbook(file);
    const row = result.rows.find((r) => r.sheet === "NAMES" && r.row === 2);
    assert.equal(
      row.candidate.data.dateOfBirth.toISOString(),
      "1990-02-03T00:00:00.000Z",
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
