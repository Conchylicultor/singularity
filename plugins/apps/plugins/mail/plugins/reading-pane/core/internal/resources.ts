import { z } from "zod";
import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import { MailMessageSchema } from "@plugins/apps/plugins/mail/plugins/mail-core/core";

// The messages of one thread, oldest→newest — drives the reading pane. A keyed
// query-resource parameterized by `{ threadId }`, rows keyed on `id`. The server
// half (`server/internal/resource.ts`) is K/scoped: its `where threadId = ?`
// filter is immutable (a message never changes threads) and its (internalDate,
// id) sort keys are insert-immutable, so a scoped in-place update (a reply, a
// flag flip, a body hydration) never reorders. Bodies are null on the envelope
// stubs; the pane hydrates each message on first expand via the sync plugin's
// `mailHydrateMessageEndpoint` (cached thereafter). The wire shape stays
// `MailMessage[]`.
export const threadMessagesResource = queryResourceDescriptor<
  z.infer<typeof MailMessageSchema>,
  { threadId: string }
>("mail-thread-messages", MailMessageSchema, "id");
