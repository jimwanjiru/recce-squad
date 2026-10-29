// Explicit terminal-only retrieval; never called automatically or exposed by an HTTP endpoint.
const { localConfiguration } = require("./local-runtime.cjs");
(async () => {
  const credentials = localConfiguration();
  const { createDatabase } = require("../backend/dist/src/config/database.js");
  const argon2 = require("argon2");
  const db = createDatabase();
  try {
    const user = await db.user.findUnique({
      where: { email: credentials.email },
    });
    if (!user) {
      console.log(
        "Existing accounts were preserved. Use your existing administrator account.",
      );
      return;
    }
    if (
      !(await argon2.verify(
        user.passwordHash,
        credentials.administratorPassword,
      ))
    ) {
      console.log(
        "The initial password has been changed. Use your current password; no account was reset.",
      );
      return;
    }
    console.log(
      `Local administrator email: ${credentials.email}\nInitial password: ${credentials.administratorPassword}\nOpen the configured localhost address. Change this password in Account settings. Keep this terminal output private.`,
    );
  } finally {
    await db.$disconnect();
  }
})().catch(() => {
  console.error(
    "Initial access could not be retrieved. Check application/database health; existing accounts were not changed.",
  );
  process.exitCode = 1;
});
