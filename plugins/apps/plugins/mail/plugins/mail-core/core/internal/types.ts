import type { z } from "zod";
import type {
  MailAddressSchema,
  MailAccountSchema,
  MailSyncStateSchema,
  MailLabelSchema,
  MailThreadSchema,
  MailMessageSchema,
  MailMessageLabelSchema,
  MailAttachmentSchema,
  MailDraftSchema,
  MailOutboxItemSchema,
} from "./fields";

// Web-safe domain types for the persisted mail rows, derived from the field
// records in `fields.ts` (the single source of truth shared with the Drizzle
// pgTables in `server/internal/tables.ts`). They use `Date` for timestamps and
// the closed enum unions, so web code models mail data without importing drizzle
// or the server barrel — and a field-set drift becomes a `tsc` error rather than
// a silently diverging hand-authored interface.

/** An email participant — display name optional, address required. */
export type MailAddress = z.infer<typeof MailAddressSchema>;

export type MailAccount = z.infer<typeof MailAccountSchema>;
export type MailSyncState = z.infer<typeof MailSyncStateSchema>;
export type MailLabel = z.infer<typeof MailLabelSchema>;
export type MailThread = z.infer<typeof MailThreadSchema>;
export type MailMessage = z.infer<typeof MailMessageSchema>;
export type MailMessageLabel = z.infer<typeof MailMessageLabelSchema>;
export type MailAttachment = z.infer<typeof MailAttachmentSchema>;
export type MailDraft = z.infer<typeof MailDraftSchema>;
export type MailOutboxItem = z.infer<typeof MailOutboxItemSchema>;
