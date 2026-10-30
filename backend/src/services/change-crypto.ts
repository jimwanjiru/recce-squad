import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createCipheriv, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { HttpError } from "./errors.js";
export async function sealChange(
  raw: unknown,
  id: string,
  mayCreateKey = false,
): Promise<Prisma.InputJsonObject> {
  const path =
    process.env.WORKBOOK_IMPORT_KEY_PATH || ".local/workbook-import.key";
  let key: Buffer;
  try {
    key = await readFile(path);
  } catch (error: any) {
    if (error.code !== "ENOENT" || !mayCreateKey)
      throw new HttpError(503, "WORKBOOK_SOURCE_KEY_UNAVAILABLE_OR_INVALID");
    await mkdir(".local", { recursive: true, mode: 0o700 });
    try {
      await writeFile(path, randomBytes(32), { flag: "wx", mode: 0o600 });
    } catch (e: any) {
      if (e.code !== "EEXIST") throw e;
    }
    key = await readFile(path);
  }
  if (key.length !== 32)
    throw new HttpError(503, "WORKBOOK_SOURCE_KEY_UNAVAILABLE_OR_INVALID");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("changes:" + id));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(raw), "utf8"),
    cipher.final(),
  ]);
  return {
    format: "AES-256-GCM",
    keyVersion: "local-workbook-v1",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}
