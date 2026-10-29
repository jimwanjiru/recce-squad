// Generates local development credentials only. Existing configuration is never overwritten.
const fs = require("node:fs");
const crypto = require("node:crypto");
if (fs.existsSync(".env") || fs.existsSync(".local/mysql.env")) {
  console.log(
    "Existing local configuration preserved; use the documented database startup command.",
  );
  process.exit(0);
}
const password = crypto.randomBytes(24).toString("hex");
fs.mkdirSync(".local", { recursive: true });
fs.writeFileSync(
  ".env",
  `DATABASE_URL=mysql://recce_dev:${password}@127.0.0.1:3307/recce_dev\nTEST_DATABASE_URL=mysql://recce_dev:${password}@127.0.0.1:3307/recce_test\nNODE_ENV=development\nPORT=3000\nAPP_ORIGIN=http://localhost:3000\nSEED_FICTIONAL=true\nDEMO_ADMIN_PASSWORD=${crypto.randomBytes(24).toString("base64url")}\n`,
  { mode: 0o600, flag: "wx" },
);
fs.writeFileSync(
  ".local/mysql.env",
  `MYSQL_DATABASE=recce_dev\nMYSQL_USER=recce_dev\nMYSQL_PASSWORD=${password}\nMYSQL_ROOT_PASSWORD=${crypto.randomBytes(24).toString("hex")}\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Local configuration created with random credentials in ignored files.",
);
