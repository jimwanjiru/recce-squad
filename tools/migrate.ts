// Applies committed Prisma-compatible migration files without native engine downloads.
// MySQL DDL is not transactional. Failed migrations remain recorded and block retries.
import "dotenv/config";
import mariadb from "mariadb";
import { readdir, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { connectionOptions } from "../backend/src/config/database.js";
async function main() {
  if (process.argv.includes("--test")) {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith("_test"))
      throw new Error("Dedicated TEST_DATABASE_URL required");
    process.env.DATABASE_URL = url;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const db = await mariadb.createConnection(
    connectionOptions(process.env.DATABASE_URL),
  );
  try {
    const lock = await db.query(
      "SELECT GET_LOCK('recce_migrations', 15) AS acquired",
    );
    if (Number(lock[0].acquired) !== 1)
      throw new Error("Migration lock unavailable");
    await db.query(
      "CREATE TABLE IF NOT EXISTS `_prisma_migrations` (`id` VARCHAR(36) NOT NULL PRIMARY KEY, `checksum` VARCHAR(64) NOT NULL, `finished_at` DATETIME(3) NULL, `migration_name` VARCHAR(255) NOT NULL, `logs` TEXT NULL, `rolled_back_at` DATETIME(3) NULL, `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `applied_steps_count` INTEGER UNSIGNED NOT NULL DEFAULT 0) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
    );
    const names = (
      await readdir("backend/prisma/migrations", { withFileTypes: true })
    )
      .filter((x) => x.isDirectory())
      .map((x) => x.name)
      .sort();
    for (const name of names) {
      const sql = await readFile(
        `backend/prisma/migrations/${name}/migration.sql`,
        "utf8",
      );
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = await db.query(
        "SELECT checksum, finished_at FROM `_prisma_migrations` WHERE migration_name=? AND rolled_back_at IS NULL",
        [name],
      );
      if (previous.length) {
        if (!previous[0].finished_at || previous[0].checksum !== checksum)
          throw new Error(
            "Failed or changed migration requires explicit recovery",
          );
        continue;
      }
      const id = randomUUID();
      await db.query(
        "INSERT INTO `_prisma_migrations` (id, checksum, migration_name) VALUES (?, ?, ?)",
        [id, checksum, name],
      );
      const triggers: string[] = [];
      const remainder = sql.replace(
        /^CREATE TRIGGER[\s\S]*?^END;/gm,
        (block) => {
          triggers.push(block);
          return "";
        },
      );
      try {
        const statements = [
          ...remainder
            .split(";")
            .map((x) => x.trim())
            .filter((x) => x.replace(/^--.*$/gm, "").trim()),
          ...triggers,
        ];
        for (const statement of statements) await db.query(statement);
        await db.query(
          "UPDATE `_prisma_migrations` SET finished_at=CURRENT_TIMESTAMP(3), applied_steps_count=? WHERE id=?",
          [statements.length, id],
        );
        console.log(`Applied ${name}`);
      } catch (e) {
        await db.query("UPDATE `_prisma_migrations` SET logs=? WHERE id=?", [
          "Migration failed; inspect local schema before explicit recovery.",
          id,
        ]);
        throw e;
      }
    }
    console.log("Migrations current");
  } finally {
    await db.query("SELECT RELEASE_LOCK('recce_migrations')").catch(() => {});
    await db.end();
  }
}
main().catch((e) => {
  console.error(
    "Migration failed:",
    e?.code ?? e?.errno ?? "CHECK_CONFIGURATION_OR_MIGRATION_STATE",
  );
  process.exitCode = 1;
});
