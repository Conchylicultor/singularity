import { z } from "zod";
import {
  fieldsToZodObject,
  nullable,
  type FieldsRecord,
} from "@plugins/fields/core";
import {
  textField,
  enumTextField,
} from "@plugins/fields/plugins/text/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { jsonField } from "@plugins/fields/plugins/json/plugins/config/core";
import {
  MAIL_LABEL_TYPES,
  MAIL_OUTBOX_OP_TYPES,
  MAIL_OUTBOX_STATUSES,
  MAIL_SYNC_STATUSES,
} from "./enums";

// Web-safe field records for the mail app's local Gmail-mirror cluster — one
// `FieldsRecord` per persisted table, the single source of truth for both the
// Drizzle pgTable (derived in `server/internal/tables.ts` via `defineEntity`)
// and the public wire schema (`fieldsToZodObject` below). A column/schema drift
// is therefore unrepresentable: `entity.table.$inferSelect ≡ z.infer<Schema>`.
//
// Each record's keys are the JS property names (camelCase) IN COLUMN ORDER. The
// DB column name is `snakeCase(key)` unless overridden in the `defineEntity`
// meta — the address columns use bespoke `*_addr(s)` / `reply_to` names there to
// avoid the SQL reserved words `from`/`to` (see `tables.ts`). FK / cascade /
// index / default DDL is also expressed in the `defineEntity` meta, NOT here —
// this file is name- and storage-agnostic (web-safe).

/** An email participant — display name optional, address required. */
export const MailAddressSchema = z.object({
  name: z.string().optional(),
  email: z.string(),
});

export const mailAccountFields = {
  id: textField(),
  email: textField(),
  name: nullable(textField()),
  avatarUrl: nullable(textField()),
  signature: nullable(textField()),
  connectedAt: nullable(dateField()),
  createdAt: dateField(),
  updatedAt: dateField(),
} satisfies FieldsRecord;

export const mailSyncStateFields = {
  accountId: textField(),
  historyId: nullable(textField()),
  lastFullSyncAt: nullable(dateField()),
  lastDeltaSyncAt: nullable(dateField()),
  status: enumTextField(MAIL_SYNC_STATUSES),
  createdAt: dateField(),
  updatedAt: dateField(),
} satisfies FieldsRecord;

export const mailLabelFields = {
  id: textField(),
  accountId: textField(),
  name: textField(),
  type: enumTextField(MAIL_LABEL_TYPES),
  color: nullable(textField()),
  textColor: nullable(textField()),
  parentId: nullable(textField()),
  messageListVisibility: nullable(textField()),
  labelListVisibility: nullable(textField()),
  createdAt: dateField(),
  updatedAt: dateField(),
} satisfies FieldsRecord;

export const mailThreadFields = {
  id: textField(),
  accountId: textField(),
  subject: nullable(textField()),
  snippet: nullable(textField()),
  participants: jsonField<z.infer<typeof MailAddressSchema>[]>({
    schema: z.array(MailAddressSchema),
    default: [],
  }),
  lastMessageAt: nullable(dateField()),
  messageCount: intField(),
  unread: boolField(),
  starred: boolField(),
  important: boolField(),
  hasAttachments: boolField(),
  labelIds: jsonField<string[]>({ schema: z.array(z.string()), default: [] }),
  historyId: nullable(textField()),
  createdAt: dateField(),
  updatedAt: dateField(),
} satisfies FieldsRecord;

export const mailMessageFields = {
  id: textField(),
  threadId: textField(),
  accountId: textField(),
  from: jsonField<z.infer<typeof MailAddressSchema>>({
    schema: MailAddressSchema,
    default: { email: "" },
  }),
  to: jsonField<z.infer<typeof MailAddressSchema>[]>({
    schema: z.array(MailAddressSchema),
    default: [],
  }),
  cc: jsonField<z.infer<typeof MailAddressSchema>[]>({
    schema: z.array(MailAddressSchema),
    default: [],
  }),
  bcc: jsonField<z.infer<typeof MailAddressSchema>[]>({
    schema: z.array(MailAddressSchema),
    default: [],
  }),
  replyTo: nullable(
    jsonField<z.infer<typeof MailAddressSchema>[]>({
      schema: z.array(MailAddressSchema),
      default: [],
    }),
  ),
  subject: nullable(textField()),
  snippet: nullable(textField()),
  headers: jsonField<Record<string, string>>({
    schema: z.record(z.string(), z.string()),
    default: {},
  }),
  bodyText: nullable(textField()),
  bodyHtml: nullable(textField()),
  internalDate: nullable(dateField()),
  unread: boolField(),
  starred: boolField(),
  isDraft: boolField(),
  isSent: boolField(),
  sizeEstimate: nullable(intField()),
  historyId: nullable(textField()),
  createdAt: dateField(),
  updatedAt: dateField(),
} satisfies FieldsRecord;

export const mailMessageLabelFields = {
  messageId: textField(),
  labelId: textField(),
  createdAt: dateField(),
} satisfies FieldsRecord;

export const mailAttachmentFields = {
  id: textField(),
  messageId: textField(),
  accountId: textField(),
  gmailAttachmentId: textField(),
  filename: textField(),
  mimeType: textField(),
  sizeBytes: intField(),
  inline: boolField(),
  contentId: nullable(textField()),
  storedAttachmentId: nullable(textField()),
  createdAt: dateField(),
  updatedAt: dateField(),
} satisfies FieldsRecord;

export const mailDraftFields = {
  id: textField(),
  accountId: textField(),
  threadId: nullable(textField()),
  gmailDraftId: nullable(textField()),
  inReplyToMessageId: nullable(textField()),
  to: jsonField<z.infer<typeof MailAddressSchema>[]>({
    schema: z.array(MailAddressSchema),
    default: [],
  }),
  cc: jsonField<z.infer<typeof MailAddressSchema>[]>({
    schema: z.array(MailAddressSchema),
    default: [],
  }),
  bcc: jsonField<z.infer<typeof MailAddressSchema>[]>({
    schema: z.array(MailAddressSchema),
    default: [],
  }),
  subject: nullable(textField()),
  bodyHtml: nullable(textField()),
  bodyText: nullable(textField()),
  createdAt: dateField(),
  updatedAt: dateField(),
} satisfies FieldsRecord;

export const mailOutboxFields = {
  id: textField(),
  accountId: textField(),
  opType: enumTextField(MAIL_OUTBOX_OP_TYPES),
  targetType: textField(),
  targetId: textField(),
  payload: jsonField<Record<string, unknown>>({
    schema: z.record(z.string(), z.unknown()),
    default: {},
  }),
  status: enumTextField(MAIL_OUTBOX_STATUSES),
  attempts: intField(),
  lastError: nullable(textField()),
  createdAt: dateField(),
  updatedAt: dateField(),
} satisfies FieldsRecord;

// Public wire schemas, derived from the field records. `entity.table.$inferSelect`
// is identical by construction to `z.infer` of these (Stage E invariant).
export const MailAccountSchema = fieldsToZodObject(mailAccountFields);
export const MailSyncStateSchema = fieldsToZodObject(mailSyncStateFields);
export const MailLabelSchema = fieldsToZodObject(mailLabelFields);
export const MailThreadSchema = fieldsToZodObject(mailThreadFields);
export const MailMessageSchema = fieldsToZodObject(mailMessageFields);
export const MailMessageLabelSchema = fieldsToZodObject(mailMessageLabelFields);
export const MailAttachmentSchema = fieldsToZodObject(mailAttachmentFields);
export const MailDraftSchema = fieldsToZodObject(mailDraftFields);
export const MailOutboxItemSchema = fieldsToZodObject(mailOutboxFields);
