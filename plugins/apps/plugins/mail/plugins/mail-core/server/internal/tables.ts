import { type AnyPgColumn, index } from "drizzle-orm/pg-core";
import {
  defineEntity,
  defaultNow,
} from "@plugins/infra/plugins/entities/server";
import {
  mailAccountFields,
  mailSyncStateFields,
  mailLabelFields,
  mailThreadFields,
  mailMessageFields,
  mailMessageLabelFields,
  mailAttachmentFields,
  mailDraftFields,
  mailOutboxFields,
} from "../../core";

// Physical tables for the mail app's local mirror of a Gmail mailbox, derived
// from the web-safe field records in `core/internal/fields.ts` via the
// `defineEntity` primitive — so `entity.table.$inferSelect` is identical by
// construction to the public `z.infer<...Schema>` (Stage E of the
// fields-unified-entities roadmap). FK / cascade / index / default DDL lives in
// the `meta` below; the field records stay name- and storage-agnostic.
//
// This file is a load-order leaf: it must NOT import another plugin's
// schema/tables file so cross-plugin schemas can depend on it without forming a
// cycle. Every table is re-exported with a leading `_` so drizzle-kit's
// `schema*.ts` glob discovers it while the barrel exposes only the handle.
//
// All address columns use bespoke `*_addr(s)` / `reply_to` DB names (set via
// `columns.<key>.name`) to avoid the SQL reserved words `from`/`to`; the TS
// property keys (`from`, `to`, `cc`, `bcc`, `replyTo`) stay readable.

const mailAccounts = defineEntity("mail_accounts", mailAccountFields, {
  primaryKey: "id",
  columns: {
    createdAt: { default: defaultNow() },
    updatedAt: { default: defaultNow() },
  },
});

const mailSyncState = defineEntity("mail_sync_state", mailSyncStateFields, {
  primaryKey: "accountId",
  columns: {
    accountId: {
      references: { column: () => mailAccounts.table.id, onDelete: "cascade" },
    },
    status: { default: "idle" },
    createdAt: { default: defaultNow() },
    updatedAt: { default: defaultNow() },
  },
});

const mailLabels = defineEntity("mail_labels", mailLabelFields, {
  primaryKey: "id",
  columns: {
    accountId: {
      references: { column: () => mailAccounts.table.id, onDelete: "cascade" },
    },
    parentId: {
      references: {
        column: (): AnyPgColumn => mailLabels.table.id,
        onDelete: "set null",
      },
    },
    createdAt: { default: defaultNow() },
    updatedAt: { default: defaultNow() },
  },
  indexes: (t) => [index("mail_labels_account_id_idx").on(t.accountId)],
});

const mailThreads = defineEntity("mail_threads", mailThreadFields, {
  primaryKey: "id",
  columns: {
    accountId: {
      references: { column: () => mailAccounts.table.id, onDelete: "cascade" },
    },
    participants: { default: [] },
    messageCount: { default: 0 },
    unread: { default: false },
    starred: { default: false },
    important: { default: false },
    hasAttachments: { default: false },
    labelIds: { default: [] },
    createdAt: { default: defaultNow() },
    updatedAt: { default: defaultNow() },
  },
  indexes: (t) => [
    index("mail_threads_account_last_msg_idx").on(t.accountId, t.lastMessageAt),
  ],
});

const mailMessages = defineEntity("mail_messages", mailMessageFields, {
  primaryKey: "id",
  columns: {
    threadId: {
      references: { column: () => mailThreads.table.id, onDelete: "cascade" },
    },
    accountId: {
      references: { column: () => mailAccounts.table.id, onDelete: "cascade" },
    },
    from: { name: "from_addr" },
    to: { name: "to_addrs", default: [] },
    cc: { name: "cc_addrs", default: [] },
    bcc: { name: "bcc_addrs", default: [] },
    replyTo: { name: "reply_to" },
    headers: { default: {} },
    unread: { default: false },
    starred: { default: false },
    isDraft: { default: false },
    isSent: { default: false },
    createdAt: { default: defaultNow() },
    updatedAt: { default: defaultNow() },
  },
  indexes: (t) => [
    index("mail_messages_thread_id_idx").on(t.threadId),
    index("mail_messages_account_id_idx").on(t.accountId),
  ],
});

const mailMessageLabels = defineEntity(
  "mail_message_labels",
  mailMessageLabelFields,
  {
    primaryKey: ["messageId", "labelId"],
    columns: {
      messageId: {
        references: { column: () => mailMessages.table.id, onDelete: "cascade" },
      },
      labelId: {
        references: { column: () => mailLabels.table.id, onDelete: "cascade" },
      },
      createdAt: { default: defaultNow() },
    },
    indexes: (t) => [
      index("mail_message_labels_label_id_idx").on(t.labelId),
    ],
  },
);

const mailAttachments = defineEntity("mail_attachments", mailAttachmentFields, {
  primaryKey: "id",
  columns: {
    messageId: {
      references: { column: () => mailMessages.table.id, onDelete: "cascade" },
    },
    accountId: {
      references: { column: () => mailAccounts.table.id, onDelete: "cascade" },
    },
    sizeBytes: { default: 0 },
    inline: { default: false },
    createdAt: { default: defaultNow() },
    updatedAt: { default: defaultNow() },
  },
  indexes: (t) => [index("mail_attachments_message_id_idx").on(t.messageId)],
});

const mailDrafts = defineEntity("mail_drafts", mailDraftFields, {
  primaryKey: "id",
  columns: {
    accountId: {
      references: { column: () => mailAccounts.table.id, onDelete: "cascade" },
    },
    threadId: {
      references: { column: () => mailThreads.table.id, onDelete: "set null" },
    },
    to: { name: "to_addrs", default: [] },
    cc: { name: "cc_addrs", default: [] },
    bcc: { name: "bcc_addrs", default: [] },
    createdAt: { default: defaultNow() },
    updatedAt: { default: defaultNow() },
  },
});

const mailOutbox = defineEntity("mail_outbox", mailOutboxFields, {
  primaryKey: "id",
  columns: {
    accountId: {
      references: { column: () => mailAccounts.table.id, onDelete: "cascade" },
    },
    payload: { default: {} },
    status: { default: "pending" },
    attempts: { default: 0 },
    createdAt: { default: defaultNow() },
    updatedAt: { default: defaultNow() },
  },
  indexes: (t) => [
    index("mail_outbox_account_status_idx").on(t.accountId, t.status),
  ],
});

// drizzle-kit schema-glob discovery. Export names kept (`_mail*`) so the server
// barrel re-exports and `schema-attachments.ts` (`_mailDrafts`) don't churn.
export const _mailAccounts = mailAccounts.table;
export const _mailSyncState = mailSyncState.table;
export const _mailLabels = mailLabels.table;
export const _mailThreads = mailThreads.table;
export const _mailMessages = mailMessages.table;
export const _mailMessageLabels = mailMessageLabels.table;
export const _mailAttachments = mailAttachments.table;
export const _mailDrafts = mailDrafts.table;
export const _mailOutbox = mailOutbox.table;
