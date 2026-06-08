import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { writeBroadcasts } from "../../shared/endpoints";

async function broadcastsPath(): Promise<string> {
  const root = await ensureMainWorktreeRoot();
  return join(root, "cli/broadcasts.json");
}

export const handleWrite = implement(writeBroadcasts, async ({ body }) => {
  const path = await broadcastsPath();
  await writeFile(path, JSON.stringify(body.entries, null, 2) + "\n", "utf-8");
  return { ok: true as const };
});
