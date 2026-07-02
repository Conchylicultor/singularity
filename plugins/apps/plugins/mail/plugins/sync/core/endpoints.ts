import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import {
  MailMessageSchema,
  MailAttachmentSchema,
} from "@plugins/apps/plugins/mail/plugins/mail-core/core";

// Manual "connect / sync now" trigger. POST with no body — `ensureAccount()`
// arms the engine and, when already in delta, enqueues an immediate delta. Used
// by the phase-3 UI and for worktree testing (the scheduled tick is main-only).
export const mailSyncEndpoint = defineEndpoint({
  route: "POST /api/mail/sync",
  response: z.object({ accountId: z.string(), status: z.string() }),
});

// On-demand body hydration — the "fetch only when opened" half of the sync model.
// The bounded backfill/delta mirror only envelopes (`format=metadata`); the full
// MIME body + attachments are fetched here, on first open of a message, and
// cached in `mail_messages`. A second open is a pure cache hit (no Gmail call).
// The message must already be in the local mirror (an envelope stub) — an id
// outside the synced window 404s until on-demand search lands (a later phase).
export const mailHydrateMessageEndpoint = defineEndpoint({
  route: "POST /api/mail/hydrate",
  body: z.object({ messageId: z.string() }),
  response: z.object({
    message: MailMessageSchema,
    attachments: z.array(MailAttachmentSchema),
  }),
});

// On-demand server-side search — pulls older-than-window mail into the mirror.
// The backfill/delta only mirror envelopes `newer_than:${BACKFILL_WINDOW_DAYS}d`;
// this takes an arbitrary Gmail query, hits `messages.list?q=`, folds the matching
// envelopes into Postgres via the same idempotent upsert, and returns the mirrored
// rows in Gmail's order. Bodies still hydrate lazily on open. `pageToken` pages the
// Gmail result set; a burst of identical searches collapses onto one handler run.
export const mailSearchEndpoint = defineEndpoint({
  route: "GET /api/mail/search",
  query: z.object({ q: z.string(), pageToken: z.string().optional() }),
  response: z.object({
    results: z.array(MailMessageSchema),
    nextPageToken: z.string().optional(),
  }),
  concurrency: 4,
  dedupe: true,
});
