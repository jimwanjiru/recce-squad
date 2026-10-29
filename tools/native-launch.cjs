// Keep the local bootstrap flags out of platform-specific shell syntax.
process.env.LOCAL_NATIVE = "true";
require(
  process.argv.includes("--access")
    ? "./local-access.cjs"
    : "./local-entrypoint.cjs",
);
