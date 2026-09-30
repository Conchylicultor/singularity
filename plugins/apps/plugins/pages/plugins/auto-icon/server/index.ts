import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { blocksChanged } from "@plugins/page/plugins/editor/server";
import { autoIconJob } from "./internal/auto-icon-job";
import { autoIconScheduleJob } from "./internal/schedule-job";
import {
  autoIconsBackfillWarmup,
  backfillAutoIconsJob,
} from "./internal/backfill";
import { handleRegeneratePageIcon } from "./internal/routes";
import { regeneratePageIcon } from "../shared/endpoints";

export default {
  description:
    "Auto-generated page emoji icons: once a page's edits settle (10 s after the last blocksChanged), Haiku picks an emoji from its title + content, avoiding its siblings' icons, and writes it only if the page still has none. A page_blocks_ext_auto_icon row records that generation ran, so it never runs again unasked; Regenerate forces a new pick; a boot backfill covers existing pages.",
  register: [
    autoIconJob,
    autoIconScheduleJob,
    backfillAutoIconsJob,
    autoIconsBackfillWarmup,
  ],
  httpRoutes: {
    [regeneratePageIcon.route]: handleRegeneratePageIcon,
  },
  contributions: [
    Trigger({
      on: blocksChanged,
      do: autoIconScheduleJob,
      with: {},
      oneShot: false,
    }),
  ],
} satisfies ServerPluginDefinition;
