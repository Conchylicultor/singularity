import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { manualSourceType } from "./internal/source-type";

export default {
  description:
    "Hand-entry event source type: probe reports a constant fingerprint (nothing upstream can change) and extract vouches for the source's own live rows, so a refresh can never bury events the user typed.",
  register: [manualSourceType],
} satisfies ServerPluginDefinition;
