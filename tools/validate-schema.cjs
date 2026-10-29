const { getDMMF } = require("@prisma/internals");
const { readFile } = require("node:fs/promises");
async function validate() {
  const datamodel = await readFile("backend/prisma/schema.prisma", "utf8");
  const result = await getDMMF({ datamodel });
  console.log(
    `Prisma WASM validation passed: ${result.datamodel.models.length} models.`,
  );
  return result;
}
if (require.main === module)
  validate().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
module.exports = { validate };
