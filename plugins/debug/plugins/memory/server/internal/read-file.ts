import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { CLAUDE_PROJECTS_DIR } from "@plugins/infra/plugins/paths/server";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { readMemoryFile as readMemoryFileEndpoint } from "../../shared/endpoints";

async function memoryDir(): Promise<string> {
  const root = await ensureMainWorktreeRoot();
  const projectKey = root.replace(/[/_]/g, "-");
  return join(CLAUDE_PROJECTS_DIR, projectKey, "memory");
}

export const readMemoryFile = implement(readMemoryFileEndpoint, async ({ params }) => {
  const name = basename(params.name);
  if (!name.endsWith(".md") || name.includes("..") || name.includes("/")) {
    throw new HttpError(400, "Invalid file name");
  }
  const dir = await memoryDir();
  try {
    const content = await readFile(join(dir, name), "utf-8");
    return { ok: true, content };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    throw new HttpError(404, "File not found");
  }
});
