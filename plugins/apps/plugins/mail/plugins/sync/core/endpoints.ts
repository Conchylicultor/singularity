import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import {
  MailMessageSchema,
  MailAttachmentSchema,
  MailLabelRefSchema,
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
// A thread-collapsed search hit. `messages.list?q=` returns individual messages;
// multiple hits in one thread are folded into ONE result here (Gmail-style),
// keyed by `threadId`. `message` is the representative (newest matched) envelope
// that paints the row + opens on click; the rollup fields (`unread`, `starred`,
// `hasAttachments`) are OR-ed across the matched messages, `messageCount` is how
// many of them landed in this thread, and `labels` is the de-duped union of the
// matched messages' user labels (system labels are filtered out server-side).
export const MailSearchResultSchema = z.object({
  threadId: z.string(),
  message: MailMessageSchema,
  messageCount: z.number().int(),
  unread: z.boolean(),
  starred: z.boolean(),
  hasAttachments: z.boolean(),
  labels: z.array(MailLabelRefSchema),
});
export type MailSearchResult = z.infer<typeof MailSearchResultSchema>;

export const mailSearchEndpoint = defineEndpoint({
  route: "GET /api/mail/search",
  query: z.object({ q: z.string(), pageToken: z.string().optional() }),
  response: z.object({
    results: z.array(MailSearchResultSchema),
    nextPageToken: z.string().optional(),
  }),
  concurrency: 4,
  dedupe: true,
});
