import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { MailThreadSchema } from "@plugins/apps/plugins/mail/plugins/mail-core/core";

// One keyset page of threads for a mailbox view. `nextCursor` is an opaque
// base64url token (see server `cursor.ts`); `hasMore` lets the infinite-scroll
// sentinel decide whether to fetch again.
export const MailThreadPageSchema = z.object({
  items: z.array(MailThreadSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type MailThreadPage = z.infer<typeof MailThreadPageSchema>;

// Windowed thread query for a mailbox view. `view` is a view string (system id
// like `inbox`, or `label:<id>`); `cursor` is null for the first page. Returns
// threads ordered newest-first (COALESCE(last_message_at, created_at) DESC, id DESC).
export const queryThreadsEndpoint = defineEndpoint({
  route: "POST /api/mail/threads",
  body: z.object({
    view: z.string(),
    cursor: z.string().nullable(),
    limit: z.number(),
  }),
  response: MailThreadPageSchema,
});

// Live invalidation tick for the thread list. A cheap coarse revision over
// `mail_threads` (count + max updatedAt); on any thread write the change-feed
// recomputes it, the value changes, and the list refetches its loaded pages in
// place (no scroll reset). Byte-identical payloads are suppressed (mode:"push"),
// so it only pulses on a genuine change. The windowed pages come over
// `queryThreadsEndpoint`; this resource carries no rows.
export const mailThreadsRevisionResource = resourceDescriptor<{ rev: string }>(
  "mail-threads-revision",
  z.object({ rev: z.string() }),
  { rev: "" },
);
