// Parse locally; never print or persist raw personnel values in logs.
const ExcelJS = require("exceljs");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
function value(cell) {
  const v = cell.value;
  return v && typeof v === "object" && ("formula" in v || "sharedFormula" in v)
    ? v.result
    : v;
}
function text(cell) {
  const v = value(cell);
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) {
    const s = String(v);
    return Number.isSafeInteger(v) && v >= 0 && /^0+$/.test(cell.numFmt || "")
      ? s.padStart(cell.numFmt.length, "0")
      : s;
  }
  if (v && Array.isArray(v.richText))
    return v.richText
      .map((x) => x.text)
      .join("")
      .trim();
  return "";
}
function calendar(cell) {
  const v = value(cell);
  if (v == null || v === "") return null;
  // ExcelJS resolves typed Excel dates using the workbook's date system.
  if (v instanceof Date && Number.isFinite(+v)) {
    if (
      v.getUTCHours() ||
      v.getUTCMinutes() ||
      v.getUTCSeconds() ||
      v.getUTCMilliseconds()
    )
      return null;
    return v;
  }
  // Only explicit ISO dates are unambiguous; partial/locale strings stay in staging.
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
    const d = new Date(v.trim() + "T00:00:00.000Z");
    if (Number.isFinite(+d) && d.toISOString().slice(0, 10) === v.trim())
      return d;
  }
  return null;
}
async function readWorkbook(file) {
  const bytes = await fs.readFile(file);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const names = wb.worksheets.find((s) => s.name.trim() === "NAMES");
  if (!names) throw new Error("WORKBOOK_NAMES_SHEET_MISSING");
  for (const [column, expected] of [
    [2, "F/NO"],
    [4, "RANK"],
    [5, "RANK"],
    [6, "FULL NAMES"],
    [8, "FULL DATE OF BIRTH"],
    [11, "DATE OF ENLIST"],
    [24, "ID. NO"],
    [27, "PHONE NO."],
  ])
    if (
      text(names.getRow(1).getCell(column))
        .toUpperCase()
        .replace(/[,\s]+$/g, "") !== expected
    )
      throw new Error("WORKBOOK_LAYOUT_CHANGED");
  const rows = [],
    keys = new Map();
  for (const sheet of wb.worksheets)
    sheet.eachRow((row, n) => {
      const raw = {};
      const numberFormats = {};
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        raw[c] = cell.value;
        if (cell.numFmt) numberFormats[c] = cell.numFmt;
      });
      raw._numberFormats = numberFormats;
      const item = {
        sheet: sheet.name,
        row: n,
        raw,
        candidate: null,
        errors: [],
        dates: {},
        originalRank: null,
      };
      if (sheet === names && n > 1 && text(row.getCell(6))) {
        const force = text(row.getCell(2)),
          fullName = text(row.getCell(6));
        const requiredErrors = [];
        if (
          !force ||
          force.length > 64 ||
          (typeof value(row.getCell(2)) === "number" &&
            !Number.isSafeInteger(value(row.getCell(2))))
        )
          requiredErrors.push("INVALID_FORCE_NUMBER");
        if (fullName.length > 255) requiredErrors.push("NAME_TOO_LONG");
        const data = {
          forceNumber: force,
          fullName,
          recordStatus: "UNVERIFIED",
        };
        for (const [c, field, max] of [
          [3, "payrollNumber", 64],
          [9, "gender", 32],
          [24, "nationalId", 64],
          [27, "phone", 255],
        ]) {
          const numeric = value(row.getCell(c));
          if (
            [3, 24, 27].includes(c) &&
            typeof numeric === "number" &&
            (!Number.isSafeInteger(numeric) || numeric < 0)
          ) {
            item.errors.push("UNSAFE_NUMERIC_IDENTIFIER_COLUMN_" + c);
            continue;
          }
          const t = text(row.getCell(c));
          if (t && t.length <= max) data[field] = t;
          else if (t) item.errors.push("FIELD_TOO_LONG_COLUMN_" + c);
          if (value(row.getCell(c)) != null && !t)
            item.errors.push("UNSUPPORTED_VALUE_COLUMN_" + c);
        }
        for (const [c, field] of [
          [8, "dateOfBirth"],
          [11, "dateEnlisted"],
        ]) {
          const date = calendar(row.getCell(c));
          if (date) data[field] = date;
          else if (
            value(row.getCell(c)) != null &&
            value(row.getCell(c)) !== ""
          )
            item.errors.push("UNRESOLVED_DATE_COLUMN_" + c);
        }
        if (
          data.dateOfBirth &&
          data.dateEnlisted &&
          data.dateOfBirth >= data.dateEnlisted
        ) {
          delete data.dateOfBirth;
          delete data.dateEnlisted;
          item.errors.push("BIRTH_ENLISTMENT_SEQUENCE_REVIEW");
        }
        // These dates may be complete but are never treated as verified historical effective dates.
        for (const c of [8, 11, 13, 14, 15, 33])
          if (row.getCell(c).value != null)
            item.dates[c] = row.getCell(c).value;
        item.originalRank = text(row.getCell(4)) || null;
        item.errors.push(...requiredErrors);
        item.candidate = {
          data,
          eligible: requiredErrors.length === 0,
          education: null,
        };
        const educationLevel = text(row.getCell(12)),
          kcseGrade = text(row.getCell(21));
        if (
          educationLevel.length <= 191 &&
          kcseGrade.length <= 191 &&
          (educationLevel || kcseGrade)
        )
          item.candidate.education = {
            educationLevel: educationLevel || null,
            kcseGrade: kcseGrade || null,
          };
        else if (educationLevel || kcseGrade)
          item.errors.push("EDUCATION_LENGTH_REVIEW");
        const key = force.normalize("NFKC").toUpperCase();
        if (force) {
          const bucket = keys.get(key) || [];
          bucket.push(item);
          keys.set(key, bucket);
        }
      }
      rows.push(item);
    });
  for (const bucket of keys.values())
    if (bucket.length > 1)
      for (const item of bucket) {
        item.candidate.eligible = false;
        item.errors.push("DUPLICATE_SOURCE_FORCE_NUMBER");
      }
  const candidates = rows.filter((r) => r.candidate);
  return {
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    rows,
    summary: {
      sourceRows: rows.length,
      candidateOfficers: candidates.length,
      eligibleOfficers: candidates.filter((r) => r.candidate.eligible).length,
      heldOfficers: candidates.filter((r) => !r.candidate.eligible).length,
      rowsWithReviewFlags: candidates.filter((r) => r.errors.length).length,
      sheets: wb.worksheets.map((s) => s.name.trim()),
    },
  };
}
function seal(raw, key, context) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(raw), "utf8"),
    cipher.final(),
  ]);
  return {
    format: "AES-256-GCM",
    keyVersion: "local-workbook-v1",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}
module.exports = { readWorkbook, seal, calendar };
