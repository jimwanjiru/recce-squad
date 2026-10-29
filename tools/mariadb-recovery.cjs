// Narrow recovery: never drops objects, deletes records or changes migration checksums.
function normalizeCheck(value) {
  return value
    .toLowerCase()
    .replace(/\bfalse\b/g, "0")
    .replace(/\btrue\b/g, "1")
    .replace(/[\s`()]/g, "");
}
async function validatePartialConstraints(db, statements) {
  const checks = statements.filter((sql) => sql.startsWith("ALTER TABLE"));
  const triggers = statements.filter((sql) => sql.startsWith("CREATE TRIGGER"));
  if (checks.length !== 11 || triggers.length !== 8)
    throw new Error("Unexpected recovery migration layout");
  for (const sql of checks) {
    const match =
      /^ALTER TABLE `([^`]+)` ADD CONSTRAINT `([^`]+)` CHECK \(([\s\S]*)\)$/.exec(
        sql,
      );
    if (!match) throw new Error("Unexpected recovery statement");
    const rows = await db.query(
      "SELECT CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=?",
      [match[1], match[2]],
    );
    if (
      rows.length !== 1 ||
      normalizeCheck(rows[0].CHECK_CLAUSE) !== normalizeCheck(match[3])
    )
      throw new Error(
        "Partial schema does not match the known MariaDB isolation-variable failure",
      );
  }
  for (const sql of triggers) {
    const name = /^CREATE TRIGGER `([^`]+)`/.exec(sql)?.[1];
    const rows = await db.query(
      "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?",
      [name],
    );
    if (rows.length)
      throw new Error("Existing triggers need manual recovery review");
  }
  return triggers;
}
module.exports = { validatePartialConstraints };
