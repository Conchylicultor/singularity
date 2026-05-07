import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";

async function broadcastsPath(): Promise<string> {
  const root = await ensureMainWorktreeRoot();
  return join(root, "cli/broadcasts.json");
}

export async function handleWrite(req: Request): Promise<Response> {
  const path = await broadcastsPath();
  const body = (await req.json()) as { entries: unknown[] };
  await writeFile(path, JSON.stringify(body.entries, null, 2) + "\n", "utf-8");
  return Response.json({ ok: true });
}
