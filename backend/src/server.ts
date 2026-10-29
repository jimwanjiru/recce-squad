import "dotenv/config";
import { z } from "zod";
import { createApp } from "./app.js";
import { createDatabase } from "./config/database.js";
const env = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_ORIGIN: z.string().url(),
  })
  .parse(process.env);
if (env.NODE_ENV === "production" && !env.APP_ORIGIN.startsWith("https://"))
  throw new Error("Production requires HTTPS APP_ORIGIN");
const db = createDatabase();
async function main() {
  await db.$connect();
  const app = await createApp(db, {
    origin: env.APP_ORIGIN,
    production: env.NODE_ENV === "production",
  });
  const server = app.listen(env.PORT, "127.0.0.1", () =>
    console.log(JSON.stringify({ event: "server_started", port: env.PORT })),
  );
  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;
    server.close(() => {
      void db.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
main().catch(() => {
  console.error(
    "Backend startup failed; check database connectivity and configuration.",
  );
  process.exitCode = 1;
});
