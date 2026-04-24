import { homedir } from "node:os";
import { join, extname } from "node:path";
import { mkdir } from "node:fs/promises";

export function attachmentsRoot(): string {
  return join(homedir(), ".singularity", "attachments");
}

export async function ensureAttachmentsRoot(): Promise<string> {
  const dir = attachmentsRoot();
  await mkdir(dir, { recursive: true });
  return dir;
}

export function diskPathFor(id: string, filename: string): string {
  const ext = extname(filename).toLowerCase() || ".bin";
  return join(attachmentsRoot(), `${id}${ext}`);
}
