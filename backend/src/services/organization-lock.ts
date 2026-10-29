import { Prisma } from "@prisma/client";
import { HttpError } from "./errors.js";
// Shared by reference changes and initial officer registration to prevent inactive-reference races.
export async function organizationLock(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM SystemSetting WHERE settingKey='_internal.organization_mutex' FOR UPDATE`;
  if (!rows.length) throw new HttpError(503, "MIGRATIONS_REQUIRED");
}
