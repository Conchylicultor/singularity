import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getBroadcasts } from "../../shared/endpoints";

async function broadcastsPath(): Promise<string> {
  const root = await ensureMainWorktreeRoot();
  return join(root, "cli/broadcasts.json");
}

export const handleRead = implement(getBroadcasts, async () => {
  const path = await broadcastsPath();
  try {
    const raw = await readFile(path, "utf-8");
    const entries = JSON.parse(raw) as unknown[];
    return { ok: true, entries, path };
  } catch {
    return { ok: true, entries: [], path };
  }
});
