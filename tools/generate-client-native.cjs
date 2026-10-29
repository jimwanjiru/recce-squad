// Cross-platform Prisma RPC client; no shell, Python or native engine downloads.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
async function main() {
  await new Promise((resolve, reject) => {
    const preparation = spawn(process.execPath, ["tools/generate-client.cjs"], {
      stdio: "inherit",
    });
    preparation.on("error", reject);
    preparation.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Schema preparation failed")),
    );
  });
  const file = ".local/client-request.json";
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [path.resolve("node_modules/@prisma/client/generator-build/index.js")],
        { stdio: ["pipe", "ignore", "pipe"] },
      );
      let buffer = "",
        done = false;
      const finish = (error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        child.stdin.end();
        child.kill();
        error ? reject(error) : resolve();
      };
      const timer = setTimeout(
        () => finish(new Error("Prisma generator timed out")),
        60000,
      );
      child.on("error", finish);
      child.on("exit", () => {
        if (!done)
          finish(new Error("Prisma generator exited before responding"));
      });
      child.stdin.on("error", finish);
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        buffer += chunk;
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          let response;
          try {
            response = JSON.parse(line);
          } catch {
            continue;
          }
          if (response.id === 1)
            finish(
              response.error
                ? new Error("Prisma generator RPC failed")
                : undefined,
            );
        }
      });
      child.stdin.write(fs.readFileSync(file));
    });
    if (!fs.existsSync("node_modules/.prisma/client/schema.prisma"))
      throw new Error("Generated client missing");
    console.log("Prisma JavaScript engine client generated.");
  } finally {
    fs.rmSync(file, { force: true });
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
