import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { ugAlignJob } from "./job";
import { songUgAlignment } from "./tables";

/**
 * The UG sheet of a song changed (`sonata.ug.tabSaved`): re-align it if it has a
 * video. A plain job in between because a supervised job takes no event payload
 * — and checking for a video here keeps a song with none from spawning a child
 * just to find nothing to do.
 */
export const onUgTabSavedJob = defineJob({
  name: "sonata.ug-alignment.on-tab-saved",
  description:
    "Re-aligns an Ultimate Guitar song to its recording when its sheet changes.",
  hold: "instant",
  input: z.object({}),
  event: z.object({ songId: z.string() }),
  dedup: "none",
  run: async ({ event }) => {
    if (event === undefined) return;
    const row = await songUgAlignment.get(event.songId);
    if (row === undefined || row.videoId === null) return;
    await ugAlignJob.enqueue({ songId: event.songId });
  },
});
