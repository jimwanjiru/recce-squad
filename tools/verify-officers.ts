import "dotenv/config";
import { parseArgs } from "node:util";
import { createDatabase } from "../backend/src/config/database.js";
import { verifyOfficerImport } from "../backend/src/services/verify-officer-import.js";

async function main() {
  const { values } = parseArgs({
    options: {
      batch: { type: "string" },
      actor: { type: "string", default: "admin@recce.local" },
      commit: { type: "boolean" },
    },
  });
  if (!values.batch) throw new Error("IMPORT_BATCH_REQUIRED");
  const url = new URL(process.env.DATABASE_URL || "");
  if (
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("LOCAL_DATABASE_REQUIRED");
  const db = createDatabase();
  try {
    const actor = await db.user.findUnique({
      where: { email: values.actor },
      select: { id: true },
    });
    if (!actor) throw new Error("OFFICER_VERIFICATION_NOT_AUTHORIZED");
    const result = await db.$transaction(
      (tx) => verifyOfficerImport(tx, values.batch!, actor.id, !!values.commit),
      { timeout: 180000, maxWait: 15000, isolationLevel: "ReadCommitted" },
    );
    console.log(JSON.stringify(result, null, 2));
    console.log(
      values.commit
        ? "Officer data verification recorded. Service statuses, source warnings and historical dates were preserved."
        : "Preview only. Use --commit to record officer data verification.",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  const code = error?.code || error?.message;
  console.error(
    "Officer verification failed:",
    /^[A-Z][A-Z0-9_]+$/.test(code || "")
      ? code
      : "CHECK_LOCAL_DATABASE_AND_MIGRATIONS",
  );
  process.exitCode = 1;
});
