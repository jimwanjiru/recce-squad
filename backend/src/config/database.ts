import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
export function connectionOptions(url: string) {
  const u = new URL(url);
  if (u.protocol !== "mysql:") throw new Error("DATABASE_URL must use mysql");
  if (
    process.env.NODE_ENV === "production" &&
    u.searchParams.get("ssl") !== "true"
  )
    throw new Error("Production MySQL requires verified TLS");
  return {
    allowPublicKeyRetrieval:
      process.env.NODE_ENV !== "production" &&
      ["127.0.0.1", "localhost"].includes(u.hostname),
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    connectionLimit: 5,
    initSql: "SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED",
    timezone: "Z",
    ...(u.searchParams.get("ssl") === "true"
      ? { ssl: { rejectUnauthorized: true } }
      : {}),
  };
}
export function createDatabase(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is required");
  return new PrismaClient({
    adapter: new PrismaMariaDb(connectionOptions(url)),
  });
}
