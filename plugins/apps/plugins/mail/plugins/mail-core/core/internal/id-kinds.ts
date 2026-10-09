import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * The mail app's own minted ids, declared once (`plugins/ids`). Gmail's own ids
 * (labels, threads, messages) are external (`externalIdField`) and not here.
 *
 * Every kind is `legacyBareUuid`: rows minted as bare uuids were prefixed by a
 * data migration, and `key` / `parse` upgrade a bare uuid from an old URL or a
 * stale client to the rewritten id.
 *
 * - `mailacct` — a connected mailbox (`mail_accounts.id`), minted on first
 *   connect; every mirror table's `account_id` follows it (FK ON UPDATE CASCADE).
 * - `mailatt` — one attachment's metadata row (`mail_attachments.id`), re-minted
 *   on every full fetch of its message: a `uuid` kind.
 * - `maildraft` — a local draft (`mail_drafts.id`).
 * - `mailout` — one queued outbox operation (`mail_outbox.id`).
 */
export const mailAccountIdKind = defineIdKind({
  prefix: "mailacct",
  label: "Mail account",
  legacyBareUuid: true,
});

export const mailAttachmentIdKind = defineIdKind({
  prefix: "mailatt",
  label: "Mail attachment",
  shape: "uuid",
  legacyBareUuid: true,
});

export const mailDraftIdKind = defineIdKind({
  prefix: "maildraft",
  label: "Mail draft",
  legacyBareUuid: true,
});

export const mailOutboxIdKind = defineIdKind({
  prefix: "mailout",
  label: "Mail outbox item",
  legacyBareUuid: true,
});

export type MailAccountId = IdOf<typeof mailAccountIdKind>;
export type MailAttachmentId = IdOf<typeof mailAttachmentIdKind>;
export type MailDraftId = IdOf<typeof mailDraftIdKind>;
export type MailOutboxId = IdOf<typeof mailOutboxIdKind>;
