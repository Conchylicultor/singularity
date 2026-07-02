import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { MailMessageSchema } from "@plugins/apps/plugins/mail/plugins/mail-core/core";

// The messages of one thread, oldest→newest — drives the reading pane. A push
// resource parameterized by `{ threadId }` and scoped to `mail_messages`, so a
// newly-arrived reply in the open thread appears live. Bodies are null on the
// envelope stubs; the pane hydrates each message on first expand via the sync
// plugin's `mailHydrateMessageEndpoint` (cached thereafter).
export const threadMessagesResource = resourceDescriptor<
  z.infer<typeof MailMessageSchema>[],
  { threadId: string }
>("mail-thread-messages", z.array(MailMessageSchema), []);
