const fs = require("node:fs");
const crypto = require("node:crypto");
const readline = require("node:readline/promises");
async function main() {
  if (fs.existsSync(".env")) {
    require("dotenv").config({ quiet: true });
    const url = new URL(process.env.DATABASE_URL);
    if (
      process.env.NODE_ENV === "production" ||
      url.protocol !== "mysql:" ||
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw new Error("Local configuration required");
    const connection = await require("mariadb").createConnection({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      allowPublicKeyRetrieval: true,
    });
    try {
      await connection.query("SELECT 1");
    } finally {
      await connection.end();
    }
    fs.mkdirSync(".local", { recursive: true, mode: 0o700 });
    if (!fs.existsSync(".local/native-access.json"))
      fs.writeFileSync(
        ".local/native-access.json",
        JSON.stringify({
          email: "admin@recce.local",
          administratorPassword: crypto.randomBytes(24).toString("base64url"),
        }),
        { flag: "wx", mode: 0o600 },
      );
    console.log(
      "Existing .env preserved; database verified and native access configuration ready. Existing accounts will not be reset. Run npm run local:build, then npm run local:start.",
    );
    return;
  }
  if (fs.existsSync(".local/native-access.json")) {
    console.log(
      "Native credentials exist but .env is missing. Restore your .env backup; existing credentials were preserved.",
    );
    process.exitCode = 1;
    return;
  }
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    console.log(
      "Create the MySQL database/account using the installation guide first. Input is visible: use a private terminal.",
    );
    const port =
      (await terminal.question("MySQL port [3306]: ")).trim() || "3306";
    const database =
      (await terminal.question("Database [recce_local]: ")).trim() ||
      "recce_local";
    const user =
      (await terminal.question("MySQL user [recce_local]: ")).trim() ||
      "recce_local";
    const password = await terminal.question(
      "MySQL account password (visible): ",
    );
    if (
      !/^\d+$/.test(port) ||
      +port < 1 ||
      +port > 65535 ||
      !/^recce_[a-zA-Z0-9_]+$/.test(database) ||
      !password ||
      /[\r\n]/.test(user + password)
    )
      throw new Error("Invalid configuration");
    const url = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`;
    const connection = await require("mariadb").createConnection({
      host: "127.0.0.1",
      port: +port,
      user,
      password,
      database,
      allowPublicKeyRetrieval: true,
    });
    try {
      await connection.query("SELECT 1");
    } finally {
      await connection.end();
    }
    fs.mkdirSync(".local", { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      ".local/native-access.json",
      JSON.stringify({
        email: "admin@recce.local",
        administratorPassword: crypto.randomBytes(24).toString("base64url"),
      }),
      { flag: "wx", mode: 0o600 },
    );
    fs.writeFileSync(
      ".env",
      `DATABASE_URL=${url}\nNODE_ENV=development\nPORT=3000\nAPP_ORIGIN=http://localhost:3000\nBIND_HOST=127.0.0.1\nSEED_FICTIONAL=false\n`,
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      "Database connection verified and private configuration saved. Run npm run local:build, then npm run local:start.",
    );
  } finally {
    terminal.close();
  }
}
main().catch((error) => {
  console.error(
    "Configuration error code:",
    /^[A-Z0-9_]+$/.test(String(error?.code))
      ? error.code
      : "CHECK_LOCAL_CONFIGURATION",
  );
  console.error(
    "Configuration failed. Check MySQL, database/account permissions and input. No passwords were logged.",
  );
  process.exitCode = 1;
});
