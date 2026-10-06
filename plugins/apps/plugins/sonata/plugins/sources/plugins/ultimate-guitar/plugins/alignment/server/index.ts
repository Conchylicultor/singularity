import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { ugTabSaved } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/server";
import { getUgAlignment, realignUg, setUgAlignmentVideo } from "../core";
import { ugAlignJob } from "./internal/job";
import { onUgTabSavedJob } from "./internal/on-tab-saved-job";
import { ugAlignmentRowsServed } from "./internal/resource";
import {
  handleGetUgAlignment,
  handleRealignUg,
  handleSetUgAlignmentVideo,
} from "./internal/routes";

export default {
  description:
    "UG sheet alignment server: owns the sonata_songs_ext_ug_alignment side-table (video, status, record) served as a lookup-only live collection, the sonata.ug-alignment.align supervised job (beat features → alignChords → record), the set-video / re-align / get endpoints, and a trigger re-aligning a song when its UG sheet changes.",
  register: [ugAlignJob, onUgTabSavedJob],
  contributions: [
    ...ugAlignmentRowsServed.declare,
    // Re-align on every sheet save. Match-any on songId — the saved song
    // reaches the job through the event payload.
    Trigger({ on: ugTabSaved, do: onUgTabSavedJob, with: {}, oneShot: false }),
  ],
  httpRoutes: {
    [getUgAlignment.route]: handleGetUgAlignment,
    [setUgAlignmentVideo.route]: handleSetUgAlignmentVideo,
    [realignUg.route]: handleRealignUg,
  },
} satisfies ServerPluginDefinition;
