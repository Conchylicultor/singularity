import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { mailSyncEndpoint } from "../core";
import { handleMailSync } from "./internal/handlers";
import { backfillJob } from "./internal/backfill";
import { deltaJob } from "./internal/delta";
import { syncTickJob } from "./internal/tick";

export default {
  description:
    "Gmail sync engine: paginated backfill, history.list incremental delta with a bounded full-resync fallback on historyId expiry, and a scheduled main-only delta tick (the documented no-polling exception). Parses MIME into envelopes/bodies/attachment-metadata and mirrors threads/messages/labels into the mail-core tables.",
  httpRoutes: { [mailSyncEndpoint.route]: handleMailSync },
  register: [backfillJob, deltaJob, syncTickJob],
} satisfies ServerPluginDefinition;
