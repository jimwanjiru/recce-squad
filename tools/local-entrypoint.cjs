const { spawnSync } = require("node:child_process");
const { localConfiguration } = require("./local-runtime.cjs");
async function main() {
  if (process.env.LOCAL_NATIVE === "true") {
    const fs = require("node:fs");
    for (const [file, instruction] of [
      [".env", "Run npm run local:configure first."],
      [
        ".local/native-access.json",
        "Run npm run local:configure to complete native setup; do not delete .env.",
      ],
      [
        "node_modules/.prisma/client/schema.prisma",
        "Run npm run local:build first.",
      ],
      ["backend/dist/src/server.js", "Run npm run local:build first."],
      ["frontend/dist/index.html", "Run npm run local:build first."],
    ]) {
      if (!fs.existsSync(file)) {
        console.error(`Missing ${file}. ${instruction}`);
        process.exitCode = 1;
        return;
      }
    }
  }
  const credentials = localConfiguration();
  const migration = spawnSync(
    process.execPath,
    ["--import", "tsx", "tools/migrate.ts"],
    { stdio: "inherit", env: process.env },
  );
  if (migration.error || migration.status !== 0)
    throw new Error("Local migration failed; server has not started");
  if (process.env.LOCAL_BOOTSTRAP === "true") {
    const {
      createDatabase,
    } = require("../backend/dist/src/config/database.js");
    const {
      permissions,
    } = require("../backend/dist/src/config/permissions.js");
    const argon2 = require("argon2");
    const db = createDatabase();
    try {
      await db.$transaction(async (tx) => {
        // Bootstrap is serialized and never changes existing accounts, passwords or role grants.
        await tx.$queryRaw`SELECT id FROM SystemSetting WHERE settingKey='_internal.organization_mutex' FOR UPDATE`;
        if ((await tx.user.count()) !== 0) {
          console.log(
            "Existing accounts preserved; administrator bootstrap skipped.",
          );
          return;
        }
        for (const code of permissions)
          await tx.permission.upsert({
            where: { code },
            create: { code, description: code },
            update: {},
          });
        const role = await tx.role.create({
          data: { name: "Local Administrator" },
        });
        for (const permission of await tx.permission.findMany())
          await tx.rolePermission.create({
            data: { roleId: role.id, permissionId: permission.id },
          });
        const user = await tx.user.create({
          data: {
            name: "Local Administrator",
            email: credentials.email,
            passwordHash: await argon2.hash(credentials.administratorPassword, {
              type: argon2.argon2id,
            }),
          },
        });
        await tx.userRole.create({
          data: { userId: user.id, roleId: role.id },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "LOCAL_ADMINISTRATOR_INITIALIZED",
            entityType: "User",
            entityId: user.id,
            changedFields: ["name", "email", "roles"],
          },
        });
        console.log(
          "Local administrator initialized. Retrieve initial access with the documented local-access command.",
        );
      });
    } finally {
      await db.$disconnect();
    }
  }
  require("../backend/dist/src/server.js");
}
main().catch((error) => {
  console.error(
    "Startup error code:",
    /^[A-Z0-9_]+$/.test(String(error?.code))
      ? error.code
      : "CHECK_LOCAL_CONFIGURATION",
  );
  console.error(
    "Local application startup failed. Check database health, migrations and private configuration. No credentials were logged.",
  );
  process.exitCode = 1;
});
