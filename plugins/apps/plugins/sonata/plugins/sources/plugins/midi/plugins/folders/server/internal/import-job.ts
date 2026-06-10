import { basename } from "node:path";
import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import {
  importMidiSong,
  getSongMidiBySourcePath,
  setSourceMissing,
} from "@plugins/apps/plugins/sonata/plugins/sources/plugins/midi/server";

// The heavy import runs as a durable job so one corrupt `.mid` fails loudly in
// the graphile job log (and retries) without stalling the watcher. The watcher
// enqueues one of these per create/update event and per reconcile-detected new
// or restored file.
export const importMidiFileJob = defineJob({
  name: "sonata.midi.import",
  input: z.object({ sourcePath: z.string() }),
  event: z.never(),
  // Coalesce a burst of events for the same file (e.g. create+update) into one
  // pending import keyed by path. A later edit still re-runs once the prior job
  // clears, so the latest bytes always win.
  dedup: { key: (input) => input.sourcePath },
  async run({ input }) {
    const { sourcePath } = input;

    // Handle the create→delete race: the event fired but the file is already
    // gone by the time the job runs. Treat it as a deletion (badge the song if
    // we have one) and return — nothing to import, no crash.
    if (!(await Bun.file(sourcePath).exists())) {
      const existing = await getSongMidiBySourcePath(sourcePath);
      if (existing) await setSourceMissing(existing.songId, true);
      return;
    }

    const bytes = await Bun.file(sourcePath).bytes();
    const existing = await getSongMidiBySourcePath(sourcePath);
    // `existingSongId` reuses the song row on re-import (edited file) and the
    // import clears `sourceMissing`. Genuine parse failures propagate so the
    // job retries and the failure is visible.
    await importMidiSong({
      bytes,
      filename: basename(sourcePath),
      sourcePath,
      existingSongId: existing?.songId,
    });
  },
});
