// Runs once per local Compose start. Never prints or overwrites existing credentials.
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
function initialize(
  mysqlDirectory = "/mysql-secrets",
  appDirectory = "/app-secrets",
) {
  fs.mkdirSync(mysqlDirectory, { recursive: true });
  fs.mkdirSync(appDirectory, { recursive: true });
  const mysqlFile = path.join(mysqlDirectory, "app-password"),
    appFile = path.join(appDirectory, "database-password");
  const read = (file) =>
    fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim() : null;
  const mysqlPassword = read(mysqlFile),
    appPassword = read(appFile);
  if (mysqlPassword && appPassword && mysqlPassword !== appPassword)
    throw new Error(
      "Credential volumes disagree; restore the matching credentials instead of replacing them.",
    );
  const password =
    mysqlPassword ?? appPassword ?? crypto.randomBytes(32).toString("hex");
  const write = (file, value, mode) => {
    if (!fs.existsSync(file))
      fs.writeFileSync(file, value + "\n", { flag: "wx", mode });
  };
  write(mysqlFile, password, 0o444);
  write(appFile, password, 0o400);
  write(
    path.join(mysqlDirectory, "root-password"),
    crypto.randomBytes(32).toString("hex"),
    0o444,
  );
  write(
    path.join(appDirectory, "administrator-password"),
    crypto.randomBytes(30).toString("base64url"),
    0o400,
  );
  // The official runtime image's unprivileged node account owns only application secrets.
  if (process.getuid?.() === 0) {
    fs.chownSync(appDirectory, 1000, 1000);
    fs.chmodSync(appDirectory, 0o700);
    for (const file of ["database-password", "administrator-password"])
      fs.chownSync(path.join(appDirectory, file), 1000, 1000);
  }
}
if (require.main === module) {
  try {
    initialize();
    console.log(
      "Local credential volumes initialized; existing values preserved.",
    );
  } catch {
    console.error(
      "Local credentials could not be initialized. Existing files were preserved; inspect volume configuration.",
    );
    process.exitCode = 1;
  }
}
module.exports = { initialize };
