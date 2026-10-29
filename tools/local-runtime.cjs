const fs = require("node:fs");
const path = require("node:path");
function localConfiguration() {
  if (process.env.LOCAL_NATIVE === "true") {
    require("dotenv").config({ quiet: true });
    const config = JSON.parse(
      fs.readFileSync(".local/native-access.json", "utf8"),
    );
    const url = new URL(process.env.DATABASE_URL);
    if (
      process.env.NODE_ENV === "production" ||
      url.protocol !== "mysql:" ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      config.email !== "admin@recce.local" ||
      typeof config.administratorPassword !== "string" ||
      config.administratorPassword.length < 14
    )
      throw new Error(
        "Native local startup requires a loopback database and development mode",
      );
    process.env.BIND_HOST = "127.0.0.1";
    process.env.LOCAL_BOOTSTRAP = "true";
    return config;
  }
  if (
    process.env.LOCAL_DOCKER !== "true" ||
    process.env.NODE_ENV === "production"
  )
    throw new Error(
      "This bootstrap is for the local Docker installation only.",
    );
  const directory = process.env.LOCAL_CREDENTIALS_DIR ?? "/run/app-secrets";
  const password = fs
    .readFileSync(path.join(directory, "database-password"), "utf8")
    .trim();
  const administratorPassword = fs
    .readFileSync(path.join(directory, "administrator-password"), "utf8")
    .trim();
  if (password.length < 32 || administratorPassword.length < 14)
    throw new Error("Missing or invalid local credentials");
  const host = process.env.LOCAL_DB_HOST ?? "mysql",
    database = process.env.LOCAL_DB_NAME ?? "recce_local",
    user = process.env.LOCAL_DB_USER ?? "recce_local";
  if (
    !/^[a-zA-Z0-9_.-]+$/.test(host) ||
    !/^recce_[a-zA-Z0-9_]+$/.test(database)
  )
    throw new Error("Invalid local database configuration");
  process.env.DATABASE_URL = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:3306/${database}`;
  return { email: "admin@recce.local", administratorPassword };
}
module.exports = { localConfiguration };
