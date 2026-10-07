import { _songs } from "@plugins/apps/plugins/sonata/plugins/library/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { ugAlignmentShape } from "../../core";

// One song's alignment to a recording, attached to the library's `sonata_songs`
// row (1:1 side-table, FK CASCADE on song delete). Table:
// `sonata_songs_ext_ug_alignment`. A row exists once the song has had a video.
export const songUgAlignment = defineExtension(
  _songs,
  "ug_alignment",
  ugAlignmentShape,
  {
    // Rows from before automatic picking had their video pasted by the user.
    columns: { pick: { default: "user" }, candidates: { default: [] } },
  },
);
export const _songUgAlignmentExt = songUgAlignment.table; // drizzle-kit discovery
