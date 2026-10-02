import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import type { DataDir } from "@plugins/infra/plugins/paths/core";
import { opSignalsDir } from "@plugins/infra/plugins/worktree/data-dirs";
import { tmuxSignalsDir } from "../../data-dirs";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

// The two wake-up directories this runtime watches: one file per tmux session
// name ever touched, and one per worktree whose op markers ever changed
// (infra/worktree's op-signal dir, which declares nothing to sweep it — its
// only reader is this runtime). Each grows with every session / worktree the
// host runs. A file's only meaning is its last touch, and a day-old touch has
// long been reconciled. A scheduled job rather than a
// timer: nothing signals "a file just turned a day old". Main-only (the
// default): the directory is host-global, and N backends sweeping it would only
// race each other.
export const pruneTmuxSignalsJob = defineJob({
  name: "runtime-tmux.prune-signals",
  description:
    "Deletes tmux and worktree-op signal files untouched for a day, keeping both wake-up directories bounded by recent sessions and worktrees.",
  hold: "seconds",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "40 4 * * *" }, // daily at 04:40 UTC
  async run() {
    const cutoff = Date.now() - MAX_AGE_MS;
    for (const signals of [tmuxSignalsDir, opSignalsDir]) {
      await pruneOlderThan(signals, cutoff);
    }
  },
});

async function pruneOlderThan(signals: DataDir, cutoff: number): Promise<void> {
  const dir = signals.ensure();
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    try {
      if ((await stat(path)).mtimeMs >= cutoff) continue;
      await unlink(path);
    } catch (err) {
      // A session or op touching the file mid-sweep may race the stat/unlink.
      if (!isEnoent(err)) throw err;
    }
  }
}
