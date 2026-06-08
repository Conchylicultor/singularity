import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getBroadcasts, type BroadcastEntry } from "../../shared/endpoints";

async function broadcastsPath(): Promise<string> {
  const root = await ensureMainWorktreeRoot();
  return join(root, "cli/broadcasts.json");
}

export const handleRead = implement(getBroadcasts, async () => {
  const path = await broadcastsPath();
  try {
    const raw = await readFile(path, "utf-8");
    const entries = JSON.parse(raw) as BroadcastEntry[];
    return { ok: true as const, entries, path };
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code !== "ENOENT" &&
      !(err instanceof SyntaxError)
    ) throw err;
    return { ok: true as const, entries: [] as BroadcastEntry[], path };
  }
});
