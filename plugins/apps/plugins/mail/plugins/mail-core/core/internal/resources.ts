import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { MailSyncStateSchema, MailLabelSchema } from "./fields";
import type { MailSyncState, MailLabel } from "./types";

// One row per connected account's sync-engine watermark + error state. The
// server resource (`sync` plugin) loads the whole `mail_sync_state` table; table
// writes auto-push via the DB change-feed, so the UI sees failures/progress live.
export const mailSyncStateResource = resourceDescriptor<MailSyncState[]>(
  "mail-sync-state",
  z.array(MailSyncStateSchema),
  [],
);

// The account's user labels, ordered by name. A push resource scoped to
// `mail_labels`: every label upsert from the sync engine auto-pushes via the DB
// change-feed.
//
// It lives HERE, in the leaf every mail plugin already imports, rather than in
// its consumer: the threads DataView reads it for the friendly label names its
// `labels` field options carry, so a filter chip reads "Promotions" rather than
// "Label_12". Hosting it in a consumer would force any future one to import that
// consumer and risk closing a cycle.
export const mailLabelsResource = resourceDescriptor<MailLabel[]>(
  "mail-labels",
  z.array(MailLabelSchema),
  [],
);
