// Applies committed Prisma-compatible migration files without native engine downloads.
// MySQL DDL is not transactional. Failed migrations remain recorded and block retries.
import "dotenv/config";
import { splitStatements } from "./sql-statements.cjs";
import mariadb from "mariadb";
import { validatePartialConstraints } from "./mariadb-recovery.cjs";
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
    const [server] = await db.query("SELECT VERSION() AS version");
    const maria = /MariaDB/i.test(server.version);
    const recover = process.argv.includes("--recover-mariadb-constraints");
    if (recover && (!maria || process.env.NODE_ENV === "production"))
      throw new Error("Recovery is restricted to local MariaDB installations");
    // Keep migration bytes/checksums; translate only the server-specific variable at execution.
    const dialect = (statement: string) =>
      maria
        ? statement.replaceAll("@@transaction_isolation", "@@tx_isolation")
        : statement;
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
        "SELECT id, checksum, finished_at FROM `_prisma_migrations` WHERE migration_name=? AND rolled_back_at IS NULL",
        [name],
      );
      const recovering =
        recover &&
        name === "20261029190100_constraints" &&
        previous.length === 1 &&
        !previous[0].finished_at &&
        previous[0].checksum === checksum;
      if (previous.length && !recovering) {
        if (
          previous.length !== 1 ||
          !previous[0].finished_at ||
          previous[0].checksum !== checksum
        )
          throw new Error(
            "Failed or changed migration requires explicit recovery",
          );
        continue;
      }
      const id = recovering ? previous[0].id : randomUUID();
      if (!recovering)
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
        const statements = [...splitStatements(remainder), ...triggers];
        let pending = statements;
        if (recovering) {
          const later = await db.query(
            "SELECT id FROM `_prisma_migrations` WHERE migration_name > ? AND rolled_back_at IS NULL",
            [name],
          );
          if (later.length)
            throw new Error("Later migrations require manual recovery review");
          pending = await validatePartialConstraints(db, statements);
          console.log(
            "Verified all 11 existing constraints; completing missing MariaDB-compatible triggers.",
          );
        }
        for (const statement of pending) await db.query(dialect(statement));
        await db.query(
          "UPDATE `_prisma_migrations` SET finished_at=CURRENT_TIMESTAMP(3), logs=NULL, applied_steps_count=? WHERE id=?",
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
