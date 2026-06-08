import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_PROJECTS_DIR } from "@plugins/infra/plugins/paths/server";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listMemoryFiles } from "../../shared/endpoints";

async function memoryDir(): Promise<string> {
  const root = await ensureMainWorktreeRoot();
  const projectKey = root.replace(/[/_]/g, "-");
  return join(CLAUDE_PROJECTS_DIR, projectKey, "memory");
}

export type MemoryFile = {
  name: string;
  type: "index" | "feedback" | "project" | "user" | "reference" | "other";
};

function typeFor(name: string): MemoryFile["type"] {
  if (name === "MEMORY.md") return "index";
  if (name.startsWith("feedback_")) return "feedback";
  if (name.startsWith("project_")) return "project";
  if (name.startsWith("user_")) return "user";
  if (name.startsWith("reference_")) return "reference";
  return "other";
}

export const listFiles = implement(listMemoryFiles, async () => {
  const dir = await memoryDir();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return { ok: true, files: [], dir };
  }
  const files: MemoryFile[] = names
    .filter((n) => n.endsWith(".md"))
    .sort((a, b) => {
      // MEMORY.md first, then alphabetical
      if (a === "MEMORY.md") return -1;
      if (b === "MEMORY.md") return 1;
      return a.localeCompare(b);
    })
    .map((name) => ({ name, type: typeFor(name) }));
  return { ok: true, files, dir };
});
