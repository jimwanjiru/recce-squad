// Real-record seeder: the private workbook stays on the operator's computer.
// Reuse the validated importer rather than embedding personnel data in source code.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { parseArgs } = require("node:util");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string", default: "reference/RECCE DETAILED.xlsx" },
      actor: { type: "string" },
      preview: { type: "boolean" },
      "backup-confirmed": { type: "boolean" },
    },
  });
  if (!values.preview && !values["backup-confirmed"]) {
    console.error(
      "Back up your database first, then run npm run db:seed:workbook -- --backup-confirmed. Use --preview for a read-only preview.",
    );
    process.exitCode = 1;
    return;
  }
  const file = path.resolve(values.file);
  if (!fs.existsSync(file)) {
    console.error(
      'Workbook missing. Copy RECCE DETAILED.xlsx into the reference folder, or pass --file "YOUR_WORKBOOK_PATH".',
    );
    process.exitCode = 1;
    return;
  }
  const args = [
    "--import",
    pathToFileURL(require.resolve("tsx")).href,
    path.join(__dirname, "import-workbook.ts"),
    "--file",
    file,
  ];
  if (!values.preview) {
    const digest = createHash("sha256")
      .update(fs.readFileSync(file))
      .digest("hex");
    args.push("--commit", "--sha256", digest, "--backup-confirmed");
  }
  if (values.actor) args.push("--actor", values.actor);
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
try {
  main();
} catch {
  console.error(
    "Workbook seeder failed. Check that dependencies and Prisma client are installed. No raw personnel values were logged.",
  );
  process.exitCode = 1;
}
