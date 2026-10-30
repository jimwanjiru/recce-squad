import { readFile } from "node:fs/promises";
import { createDecipheriv } from "node:crypto";
import { HttpError } from "./errors.js";
export const workbookColumns: [string, string?][] = [
  ["Source serial"],
  ["Force number"],
  ["Payroll number", "payroll_number"],
  ["Rank 1 — original rank / specialization", "rank_history"],
  ["Rank 2 — overall rank", "rank_history"],
  ["Full name"],
  ["Ethnicity", "ethnicity"],
  ["Birth date", "date_of_birth"],
  ["Gender", "gender"],
  ["County / district", "county"],
  ["Enlistment date", "date_enlisted"],
  ["Education", "education"],
  ["Date to unit", "service_profile"],
  ["Date to sub-unit", "assignments"],
  ["Promotion date", "rank_history"],
  ["Duties", "assignments"],
  ["Places served", "assignments"],
  ["Courses", "courses"],
  ["Formation", "assignments"],
  ["Disposition", "assignments"],
  ["KCSE grade", "education"],
  ["Source membership flag", "service_profile"],
  ["Remarks", "service_profile"],
  ["National ID", "national_id"],
  ["Police law examination", "examinations"],
  ["Commendations / awards", "awards"],
  ["Phone", "phone"],
  ["Disciplinary convictions", "disciplinary_records"],
  ["Warnings / shortcomings", "disciplinary_records"],
  ["Source rank duration", "rank_history"],
  ["Source service duration", "date_enlisted"],
  ["Source age", "date_of_birth"],
  ["Source retirement date", "service_profile"],
  ["Source retirement remaining", "service_profile"],
  ["Source sub-unit duration", "assignments"],
  ["Bank account", "financial_details"],
  ["Bank name", "financial_details"],
  ["Source retirement warning", "service_profile"],
];
export function canColumn(
  grants: Set<string>,
  column: number,
  action: "view" | "write",
) {
  const definition = workbookColumns[column - 1];
  return (
    !!definition &&
    (!definition[1] || grants.has(`fields.${definition[1]}.${action}`))
  );
}
export async function openSource(
  raw: any,
  context: string,
): Promise<Record<string, any>> {
  try {
    if (
      raw?.format !== "AES-256-GCM" ||
      raw?.keyVersion !== "local-workbook-v1"
    )
      throw new Error();
    const key = await readFile(
      process.env.WORKBOOK_IMPORT_KEY_PATH || ".local/workbook-import.key",
    );
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(raw.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(raw.tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(raw.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new HttpError(503, "WORKBOOK_SOURCE_KEY_UNAVAILABLE_OR_INVALID");
  }
}
export function sourceText(value: any): string {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  if ("formula" in value || "sharedFormula" in value)
    return sourceText(value.result);
  if (Array.isArray(value.richText))
    return value.richText.map((v: any) => v.text).join("");
  if ("error" in value) return String(value.error);
  return JSON.stringify(value);
}
export function checkSourceOfficer(
  raw: Record<string, any>,
  officer: { forceNumber: string },
) {
  let force = sourceText(raw["2"]).trim();
  const format = raw._numberFormats?.["2"];
  if (typeof raw["2"] === "number" && /^0+$/.test(format || ""))
    force = force.padStart(format.length, "0");
  if (force !== officer.forceNumber)
    throw new HttpError(409, "WORKBOOK_OFFICER_IDENTITY_MISMATCH");
}
