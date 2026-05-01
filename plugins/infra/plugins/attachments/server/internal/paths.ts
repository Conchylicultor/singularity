import { extname } from "node:path";
import { mkdir } from "node:fs/promises";
import { ATTACHMENTS_DIR } from "@plugins/infra/plugins/paths/server";

export { ATTACHMENTS_DIR };

export async function ensureAttachmentsRoot(): Promise<string> {
  await mkdir(ATTACHMENTS_DIR, { recursive: true });
  return ATTACHMENTS_DIR;
}

export function diskPathFor(id: string, filename: string): string {
  const ext = extname(filename).toLowerCase() || ".bin";
  return `${ATTACHMENTS_DIR}/${id}${ext}`;
}
