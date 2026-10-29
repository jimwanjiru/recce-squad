const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { splitStatements } = require("./sql-statements.cjs");
const { validatePartialConstraints } = require("./mariadb-recovery.cjs");
const sql = fs.readFileSync(
  "backend/prisma/migrations/20261029190100_constraints/migration.sql",
  "utf8",
);
const triggers = [];
const remainder = sql.replace(/^CREATE TRIGGER[\s\S]*?^END;/gm, (block) => {
  triggers.push(block);
  return "";
});
const checks = splitStatements(remainder);
const statements = [...checks, ...triggers];
function database(mode) {
  return {
    query: async (query, args) => {
      if (query.includes("CHECK_CONSTRAINTS")) {
        if (mode === "missing") return [];
        const check = checks.find((sql) => sql.includes("`" + args[1] + "`"));
        return [
          {
            CHECK_CLAUSE:
              mode === "mismatch"
                ? "1=1"
                : check.match(/CHECK \(([\s\S]*)\)$/)[1].replace(/FALSE/g, "0"),
          },
        ];
      }
      if (query.includes("TRIGGERS"))
        return mode === "trigger" ? [{ TRIGGER_NAME: args[0] }] : [];
      throw new Error(
        "Unexpected SQL: recovery validation must only read metadata",
      );
    },
  };
}
test("MariaDB recovery verifies every existing constraint before returning missing triggers", async () => {
  assert.deepEqual(
    await validatePartialConstraints(database(), statements),
    triggers,
  );
});
for (const mode of ["missing", "mismatch", "trigger"])
  test("MariaDB recovery refuses " + mode + " schema state", async () => {
    await assert.rejects(
      validatePartialConstraints(database(mode), statements),
    );
  });
