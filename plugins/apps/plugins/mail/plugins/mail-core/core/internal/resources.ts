import { z } from "zod";
import { liveValue } from "@plugins/network/plugins/live/core";
import { MailSyncStateSchema, MailLabelSchema } from "./fields";

// One row per connected account's sync-engine watermark + error state. Served by
// the `sync` plugin (`mailSyncStateServed`), which loads the whole
// `mail_sync_state` table; table writes recompute and push it via the DB
// change-feed, so the UI sees failures/progress live. A value, not a
// collection: both readers fold every row into one sync view.
export const mailSyncState = liveValue("mail-sync-state", {
  schema: z.array(MailSyncStateSchema),
});

// The account's user labels, ordered by name. Served here
// (`mailLabelsServed`) over `mail_labels`: every label upsert from the sync
// engine recomputes and pushes it via the DB change-feed.
//
// It lives HERE, in the leaf every mail plugin already imports, rather than in
// its consumer: the threads DataView reads it for the friendly label names its
// `labels` field options carry, so a filter chip reads "Promotions" rather than
// "Label_12". Hosting it in a consumer would force any future one to import that
// consumer and risk closing a cycle.
export const mailLabels = liveValue("mail-labels", {
  schema: z.array(MailLabelSchema),
});
