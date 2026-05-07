import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";

async function broadcastsPath(): Promise<string> {
  const root = await ensureMainWorktreeRoot();
  return join(root, "cli/broadcasts.json");
}

export async function handleRead(): Promise<Response> {
  const path = await broadcastsPath();
  try {
    const raw = await readFile(path, "utf-8");
    const entries = JSON.parse(raw) as unknown[];
    return Response.json({ ok: true, entries, path });
  } catch {
    return Response.json({ ok: true, entries: [], path });
  }
}
