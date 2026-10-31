import "dotenv/config";
import { parseArgs } from "node:util";
import { readWorkbook } from "./workbook-import-data.cjs";
import { createDatabase } from "../backend/src/config/database.js";
import { completePersonnelImport } from "../backend/src/services/complete-personnel-import.js";
async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      batch: { type: "string" },
      sha256: { type: "string" },
      actor: { type: "string", default: "admin@recce.local" },
      commit: { type: "boolean" },
      approved: { type: "boolean" },
      "backup-confirmed": { type: "boolean" },
    },
  });
  if (!values.file || !values.batch || !values.sha256)
    throw Error("FILE_BATCH_AND_SHA256_REQUIRED");
  const url = new URL(process.env.DATABASE_URL || "");
  if (
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw Error("LOCAL_DATABASE_REQUIRED");
  if (values.commit && (!values.approved || !values["backup-confirmed"]))
    throw Error("APPROVAL_AND_BACKUP_CONFIRMATION_REQUIRED");
  const workbook = await readWorkbook(values.file);
  if (workbook.sha256 !== values.sha256)
    throw Error("WORKBOOK_CHECKSUM_MISMATCH");
  const db = createDatabase();
  try {
    const result = await db.$transaction(
      (tx) =>
        completePersonnelImport(tx, {
          batchId: values.batch!,
          sha256: workbook.sha256,
          actorEmail: values.actor!,
          rows: workbook.rows,
          commit: !!values.commit,
        }),
      { timeout: 300000, maxWait: 15000, isolationLevel: "ReadCommitted" },
    );
    console.log(JSON.stringify(result, null, 2));
    console.log(
      values.commit
        ? "Personnel update committed. Existing officers, manual edits, histories and Changes records preserved."
        : "Preview only. No database writes. Use --commit --approved --backup-confirmed after making a protected local database backup.",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    "Personnel update failed:",
    /^[A-Z][A-Z0-9_]+$/.test(error?.message || "")
      ? error.message
      : "CHECK_LOCAL_CONFIGURATION_AND_MIGRATIONS",
  );
  process.exitCode = 1;
});
