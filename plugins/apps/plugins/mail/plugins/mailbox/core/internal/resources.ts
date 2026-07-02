import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { MailLabelSchema } from "@plugins/apps/plugins/mail/plugins/mail-core/core";

// The user labels for the connected account, ordered by name — drives the label
// section of the mailbox sidebar. A push resource scoped to `mail_labels`: every
// label upsert from the sync engine auto-pushes via the DB change-feed.
export const mailLabelsResource = resourceDescriptor<
  z.infer<typeof MailLabelSchema>[]
>("mail-labels", z.array(MailLabelSchema), []);

// Unread thread counts per view, keyed by view id (system ids like `inbox` plus
// `label:<id>` for user labels). Drives the sidebar's unread badges. A push
// resource scoped to `mail_threads` (recomputed on any thread write), debounced.
export const mailViewCountsResource = resourceDescriptor<Record<string, number>>(
  "mail-view-counts",
  z.record(z.string(), z.number()),
  {},
);
