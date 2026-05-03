import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { CLAUDE_PROJECTS_DIR } from "@plugins/infra/plugins/paths/server";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";

async function memoryDir(): Promise<string> {
  const root = await ensureMainWorktreeRoot();
  const projectKey = root.replace(/[/_]/g, "-");
  return join(CLAUDE_PROJECTS_DIR, projectKey, "memory");
}

export async function readMemoryFile(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const name = basename(url.pathname.split("/").at(-1) ?? "");
  if (!name.endsWith(".md") || name.includes("..") || name.includes("/")) {
    return Response.json({ ok: false, error: "Invalid file name" }, { status: 400 });
  }
  const dir = await memoryDir();
  try {
    const content = await readFile(join(dir, name), "utf-8");
    return Response.json({ ok: true, content });
  } catch {
    return Response.json({ ok: false, error: "File not found" }, { status: 404 });
  }
}
