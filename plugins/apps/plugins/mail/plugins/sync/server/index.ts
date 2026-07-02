import {
  Resource,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import {
  mailSyncEndpoint,
  mailHydrateMessageEndpoint,
  mailSearchEndpoint,
} from "../core";
import {
  handleMailSync,
  handleMailHydrate,
  handleMailSearch,
} from "./internal/handlers";
import { backfillJob } from "./internal/backfill";
import { deltaJob } from "./internal/delta";
import { syncTickJob } from "./internal/tick";
import { mailSyncStateServerResource } from "./internal/resource";

export { mailSyncStateServerResource } from "./internal/resource";

export default {
  description:
    "Gmail sync engine (on-demand model): a bounded, metadata-only backfill mirrors a recent window of message envelopes; history.list incremental delta keeps them fresh (with a bounded full-resync fallback on historyId expiry) via a scheduled main-only delta tick (the documented no-polling exception). Message bodies + attachments are hydrated lazily on first open and cached (POST /api/mail/hydrate). Mirrors threads/messages/labels into the mail-core tables.",
  contributions: [Resource.Declare(mailSyncStateServerResource)],
  httpRoutes: {
    [mailSyncEndpoint.route]: handleMailSync,
    [mailHydrateMessageEndpoint.route]: handleMailHydrate,
    [mailSearchEndpoint.route]: handleMailSearch,
  },
  register: [backfillJob, deltaJob, syncTickJob],
} satisfies ServerPluginDefinition;
