import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { tmuxSignalsDir } from "../../data-dirs";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

// One signal file per tmux session name ever touched, so the directory grows
// with every session the host runs. A file's only meaning is its last touch,
// and a day-old touch has long been reconciled. A scheduled job rather than a
// timer: nothing signals "a file just turned a day old". Main-only (the
// default): the directory is host-global, and N backends sweeping it would only
// race each other.
export const pruneTmuxSignalsJob = defineJob({
  name: "runtime-tmux.prune-signals",
  description:
    "Deletes tmux signal files untouched for a day, keeping the wake-up directory bounded by recent sessions.",
  hold: "seconds",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "40 4 * * *" }, // daily at 04:40 UTC
  async run() {
    const dir = tmuxSignalsDir.ensure();
    const cutoff = Date.now() - MAX_AGE_MS;
    for (const name of await readdir(dir)) {
      const path = join(dir, name);
      try {
        if ((await stat(path)).mtimeMs >= cutoff) continue;
        await unlink(path);
      } catch (err) {
        // A session touching or closing mid-sweep may race the stat/unlink.
        if (!isEnoent(err)) throw err;
      }
    }
  },
});
