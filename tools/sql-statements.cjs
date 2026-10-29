// Split ordinary MySQL statements while preserving quoted semicolons and removing comments.
// Trigger BEGIN/END blocks are extracted separately by the migration runner.
function splitStatements(sql) {
  const statements = [];
  let current = "",
    quote = null,
    lineComment = false,
    blockComment = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i],
      next = sql[i + 1];
    if (lineComment) {
      if (c === "\n") {
        lineComment = false;
        current += "\n";
      }
      continue;
    }
    if (blockComment) {
      if (c === "*" && next === "/") {
        blockComment = false;
        current += " ";
        i++;
      }
      continue;
    }
    if (quote) {
      current += c;
      if (c === "\\" && next !== undefined) {
        current += next;
        i++;
      } else if (c === quote) {
        if (next === quote) {
          current += next;
          i++;
        } else quote = null;
      }
      continue;
    }
    if (c === "-" && next === "-" && /\s/.test(sql[i + 2] ?? " ")) {
      lineComment = true;
      i++;
      continue;
    }
    if (c === "#") {
      lineComment = true;
      continue;
    }
    if (c === "/" && next === "*") {
      if (sql[i + 2] === "!")
        throw new Error(
          "Executable SQL comments require a native migration tool",
        );
      blockComment = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      current += c;
      continue;
    }
    if (c === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
    } else current += c;
  }
  if (quote || blockComment)
    throw new Error("Unterminated SQL string or comment");
  if (current.trim()) statements.push(current.trim());
  return statements;
}
module.exports = { splitStatements };
