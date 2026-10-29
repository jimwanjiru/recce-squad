import "dotenv/config";
import argon2 from "argon2";
import { createDatabase } from "../src/config/database.js";
import { permissions } from "../src/config/permissions.js";
const roles = [
  "System Administrator",
  "Personnel Administrator",
  "Records Officer",
  "Sub-Unit Supervisor",
  "Reporting Officer",
  "Read-Only User",
];
async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.SEED_FICTIONAL !== "true"
  )
    throw new Error(
      "Fictional seed requires explicit SEED_FICTIONAL=true outside production",
    );
  const password = process.env.DEMO_ADMIN_PASSWORD;
  if (!password || password.length < 14)
    throw new Error("Set DEMO_ADMIN_PASSWORD securely (14+ characters)");
  const db = createDatabase();
  try {
    await db.$transaction(async (tx) => {
      for (const name of roles)
        await tx.role.upsert({ where: { name }, create: { name }, update: {} });
      for (const code of permissions)
        await tx.permission.upsert({
          where: { code },
          create: { code, description: code },
          update: {},
        });
      // The demo role is distinct from operational roles. Never assign a production permission matrix by assumption.
      const role = await tx.role.upsert({
        where: { name: "Fictional Development Administrator" },
        create: { name: "Fictional Development Administrator" },
        update: {},
      });
      for (const permission of await tx.permission.findMany())
        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          create: { roleId: role.id, permissionId: permission.id },
          update: {},
        });
      const user = await tx.user.upsert({
        where: { email: "developer@example.invalid" },
        create: {
          email: "developer@example.invalid",
          name: "Fictional Development Administrator",
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        },
        update: {},
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        create: { userId: user.id, roleId: role.id },
        update: {},
      });
      await tx.officer.upsert({
        where: { forceNumber: "FICTIONAL-001" },
        create: {
          forceNumber: "FICTIONAL-001",
          fullName: "Fictional Officer Alpha",
          recordStatus: "UNVERIFIED",
        },
        update: {},
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "FICTIONAL_SEED",
          entityType: "System",
          entityId: "development",
          changedFields: [],
        },
      });
    });
    console.log("Fictional seed complete; no personnel policy activated.");
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Seed failed: check explicit development flags, local credentials and database configuration.",
  );
  process.exitCode = 1;
});
