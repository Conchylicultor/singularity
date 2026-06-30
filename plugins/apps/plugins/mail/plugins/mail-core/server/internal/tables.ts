import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import type {
  MailAddress,
  MailLabelType,
  MailOutboxOpType,
  MailOutboxStatus,
  MailSyncStatus,
} from "../../core";

// Physical tables for the mail app's local mirror of a Gmail mailbox. This file
// is a load-order leaf: it must NOT import another plugin's schema/tables file
// so cross-plugin schemas can depend on it without forming a cycle. Web-safe
// domain types live in `core/`; drizzle ties jsonb/enum columns to them via
// `.$type<...>()`. Every table is exported with a leading `_` so drizzle-kit's
// `schema*.ts` glob discovers it while the barrel exposes only the handle.
//
// All address columns use `*_addr(s)` DB names to avoid the SQL reserved words
// `from`/`to`; the inferred TS property keys (`from`, `to`, `cc`, `bcc`,
// `replyTo`) stay readable. See the task report for the rationale.

export const _mailAccounts = pgTable("mail_accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  signature: text("signature"),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const _mailSyncState = pgTable("mail_sync_state", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => _mailAccounts.id, { onDelete: "cascade" }),
  historyId: text("history_id"),
  lastFullSyncAt: timestamp("last_full_sync_at", { withTimezone: true }),
  lastDeltaSyncAt: timestamp("last_delta_sync_at", { withTimezone: true }),
  status: text("status").$type<MailSyncStatus>().notNull().default("idle"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const _mailLabels = pgTable(
  "mail_labels",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => _mailAccounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").$type<MailLabelType>().notNull(),
    color: text("color"),
    textColor: text("text_color"),
    parentId: text("parent_id").references((): AnyPgColumn => _mailLabels.id, {
      onDelete: "set null",
    }),
    messageListVisibility: text("message_list_visibility"),
    labelListVisibility: text("label_list_visibility"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("mail_labels_account_id_idx").on(t.accountId)],
);

export const _mailThreads = pgTable(
  "mail_threads",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => _mailAccounts.id, { onDelete: "cascade" }),
    subject: text("subject"),
    snippet: text("snippet"),
    participants: jsonb("participants").$type<MailAddress[]>().notNull().default([]),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    messageCount: integer("message_count").notNull().default(0),
    unread: boolean("unread").notNull().default(false),
    starred: boolean("starred").notNull().default(false),
    important: boolean("important").notNull().default(false),
    hasAttachments: boolean("has_attachments").notNull().default(false),
    labelIds: jsonb("label_ids").$type<string[]>().notNull().default([]),
    historyId: text("history_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("mail_threads_account_last_msg_idx").on(t.accountId, t.lastMessageAt)],
);

export const _mailMessages = pgTable(
  "mail_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => _mailThreads.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => _mailAccounts.id, { onDelete: "cascade" }),
    from: jsonb("from_addr").$type<MailAddress>().notNull(),
    to: jsonb("to_addrs").$type<MailAddress[]>().notNull().default([]),
    cc: jsonb("cc_addrs").$type<MailAddress[]>().notNull().default([]),
    bcc: jsonb("bcc_addrs").$type<MailAddress[]>().notNull().default([]),
    replyTo: jsonb("reply_to").$type<MailAddress[]>(),
    subject: text("subject"),
    snippet: text("snippet"),
    headers: jsonb("headers").$type<Record<string, string>>().notNull().default({}),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    internalDate: timestamp("internal_date", { withTimezone: true }),
    unread: boolean("unread").notNull().default(false),
    starred: boolean("starred").notNull().default(false),
    isDraft: boolean("is_draft").notNull().default(false),
    isSent: boolean("is_sent").notNull().default(false),
    sizeEstimate: integer("size_estimate"),
    historyId: text("history_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("mail_messages_thread_id_idx").on(t.threadId),
    index("mail_messages_account_id_idx").on(t.accountId),
  ],
);

export const _mailMessageLabels = pgTable(
  "mail_message_labels",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => _mailMessages.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => _mailLabels.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.labelId] }),
    index("mail_message_labels_label_id_idx").on(t.labelId),
  ],
);

export const _mailAttachments = pgTable(
  "mail_attachments",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => _mailMessages.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => _mailAccounts.id, { onDelete: "cascade" }),
    gmailAttachmentId: text("gmail_attachment_id").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    inline: boolean("inline").notNull().default(false),
    contentId: text("content_id"),
    storedAttachmentId: text("stored_attachment_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("mail_attachments_message_id_idx").on(t.messageId)],
);

export const _mailDrafts = pgTable("mail_drafts", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => _mailAccounts.id, { onDelete: "cascade" }),
  threadId: text("thread_id").references(() => _mailThreads.id, {
    onDelete: "set null",
  }),
  gmailDraftId: text("gmail_draft_id"),
  inReplyToMessageId: text("in_reply_to_message_id"),
  to: jsonb("to_addrs").$type<MailAddress[]>().notNull().default([]),
  cc: jsonb("cc_addrs").$type<MailAddress[]>().notNull().default([]),
  bcc: jsonb("bcc_addrs").$type<MailAddress[]>().notNull().default([]),
  subject: text("subject"),
  bodyHtml: text("body_html"),
  bodyText: text("body_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const _mailOutbox = pgTable(
  "mail_outbox",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => _mailAccounts.id, { onDelete: "cascade" }),
    opType: text("op_type").$type<MailOutboxOpType>().notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").$type<MailOutboxStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("mail_outbox_account_status_idx").on(t.accountId, t.status)],
);
