process.env.WORKBOOK_IMPORT_KEY_PATH = require("node:path").resolve(
  ".local/browser-source.key",
);
require("dotenv").config({ quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("Dedicated test database required");
process.env.DATABASE_URL = url;
process.env.NODE_ENV = "test";
process.env.PORT = "3100";
process.env.APP_ORIGIN = "http://127.0.0.1:3100";
require("../../backend/dist/src/server.js");
