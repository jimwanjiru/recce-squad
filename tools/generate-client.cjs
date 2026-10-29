// Pinned Prisma generator RPC, using the JavaScript engine and no native downloads.
const fs = require("node:fs");
const path = require("node:path");
const { getDMMF, getConfig } = require("@prisma/internals");
(async () => {
  const schemaPath = path.resolve("backend/prisma/schema.prisma");
  const datamodel = fs.readFileSync(schemaPath, "utf8");
  const dmmf = await getDMMF({ datamodel });
  const config = await getConfig({ datamodel, ignoreEnvVarErrors: true });
  const generator = {
    ...config.generators[0],
    output: {
      value: path.resolve("node_modules/.prisma/client"),
      fromEnvVar: null,
    },
    isCustomOutput: true,
  };
  const params = {
    datamodel,
    datasources: config.datasources,
    generator,
    dmmf,
    otherGenerators: [],
    schemaPath,
    version: require("@prisma/engines-version").enginesVersion,
    binaryPaths: {},
    noEngine: false,
    postinstall: false,
    envPaths: { rootEnvPath: null, schemaEnvPath: null },
  };
  fs.mkdirSync(".local", { recursive: true });
  fs.writeFileSync(
    ".local/client-request.json",
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "generate", params }) +
      "\n",
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
