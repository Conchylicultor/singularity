import { randomUUID } from "node:crypto";
import { and, eq, inArray, not, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import type {
  GmailLabel,
  GmailMessage,
} from "@plugins/apps/plugins/mail/plugins/gmail-api/core";
import type { MailAddress } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import {
  _mailAttachments,
  _mailLabels,
  _mailMessageLabels,
  _mailMessages,
  _mailThreads,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { parseGmailMessage } from "./mime";

// Storage layer for the Gmail sync engine: maps parsed Gmail wire objects into
// the mail-core tables. Every write is idempotent (UPSERT / reconcile) so a job
// can re-run a page after a crash without duplicating rows. On every
// `onConflictDoUpdate` we set `updatedAt` explicitly — the DB `default now()`
// only fires on INSERT.

/** Derive the boolean message flags from a Gmail label-id set. */
export function flagsFromLabels(labelIds: string[]): {
  unread: boolean;
  starred: boolean;
  isSent: boolean;
  isDraft: boolean;
  important: boolean;
} {
  return {
    unread: labelIds.includes("UNREAD"),
    starred: labelIds.includes("STARRED"),
    isSent: labelIds.includes("SENT"),
    isDraft: labelIds.includes("DRAFT"),
    important: labelIds.includes("IMPORTANT"),
  };
}

/** Upsert the account's Gmail labels into `mail_labels`. */
export async function upsertLabels(
  accountId: string,
  gmailLabels: GmailLabel[],
): Promise<void> {
  if (gmailLabels.length === 0) return;
  const rows = gmailLabels.map((label) => ({
    id: label.id,
    accountId,
    name: label.name,
    type: label.type ?? ("user" as const),
    color: label.color?.backgroundColor ?? null,
    textColor: label.color?.textColor ?? null,
    messageListVisibility: label.messageListVisibility ?? null,
    labelListVisibility: label.labelListVisibility ?? null,
  }));
  await db
    .insert(_mailLabels)
    .values(rows)
    .onConflictDoUpdate({
      target: _mailLabels.id,
      set: {
        name: sql`excluded.name`,
        type: sql`excluded.type`,
        color: sql`excluded.color`,
        textColor: sql`excluded.text_color`,
        messageListVisibility: sql`excluded.message_list_visibility`,
        labelListVisibility: sql`excluded.label_list_visibility`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Guarantee a `mail_labels` row exists for each id so the `mail_message_labels`
 * FK is satisfiable even for labels not yet seen by a full `upsertLabels` sync
 * (e.g. a label referenced by a delta before the label list refresh). The stub
 * uses the id as the name and self-heals on the next `upsertLabels`.
 */
export async function ensureLabelsExist(
  accountId: string,
  labelIds: string[],
): Promise<void> {
  if (labelIds.length === 0) return;
  const rows = labelIds.map((id) => ({
    id,
    accountId,
    name: id,
    type: (id === id.toUpperCase() ? "system" : "user") as "system" | "user",
  }));
  await db.insert(_mailLabels).values(rows).onConflictDoNothing();
}

/**
 * Whether a message row has its full body cached (fetched via `format=full`).
 * `bodyFetchedAt` is the authoritative marker; a present body with a null marker
 * is a legacy row from the pre-on-demand full backfill and counts as hydrated,
 * so opening it never re-fetches. A genuinely body-less message (e.g. an
 * attachment-only mail) is disambiguated by the marker alone.
 */
export function isMessageHydrated(row: {
  bodyFetchedAt: Date | null;
  bodyHtml: string | null;
  bodyText: string | null;
}): boolean {
  return (
    row.bodyFetchedAt != null || row.bodyHtml != null || row.bodyText != null
  );
}

/**
 * Parse + upsert one Gmail message, reconciling labels + thread.
 *
 * `full` controls whether the MIME body + attachments are written:
 * - `false` (metadata sync): only the envelope/flags/labels are (re)written; the
 *   body columns, `bodyFetchedAt`, and attachments are LEFT UNTOUCHED. This is
 *   what the bounded backfill and steady-state delta use — so a label change on
 *   an already-hydrated message never wipes its cached body, and a metadata sync
 *   of a fresh message inserts an envelope-only stub (body null).
 * - `true` (on-demand hydration): additionally writes `bodyText`/`bodyHtml`,
 *   stamps `bodyFetchedAt`, and reconciles the attachment metadata.
 */
async function writeMessage(
  accountId: string,
  msg: GmailMessage,
  full: boolean,
): Promise<void> {
  const parsed = parseGmailMessage(msg);
  const flags = flagsFromLabels(parsed.labelIds);

  // Body columns are written only on a full (hydration) fetch. On a metadata
  // sync they are omitted from BOTH the insert (→ DB defaults: null / null) and
  // the update (→ any previously-cached body is preserved).
  const body = full
    ? {
        bodyText: parsed.bodyText,
        bodyHtml: parsed.bodyHtml,
        bodyFetchedAt: new Date(),
      }
    : {};

  // The message-level attachment flag is authoritative only on a full fetch
  // (real MIME parts present). Non-inline parts match Gmail's `has:attachment`
  // paperclip semantics (inline cid: images are not attachments). On a metadata
  // sync it is omitted from BOTH insert (→ DB default false) and update (→ a
  // previously scan-set/hydrated flag is preserved).
  const attachmentFlag = full
    ? { hasAttachments: parsed.attachments.some((a) => !a.inline) }
    : {};

  // 1. Ensure the FK-parent thread stub exists before inserting the message.
  await db
    .insert(_mailThreads)
    .values({ id: msg.threadId, accountId })
    .onConflictDoNothing();

  // 2. Upsert the message envelope + derived flags (+ body when hydrating).
  const envelope = {
    threadId: msg.threadId,
    from: parsed.from,
    to: parsed.to,
    cc: parsed.cc,
    bcc: parsed.bcc,
    replyTo: parsed.replyTo,
    subject: parsed.subject,
    snippet: parsed.snippet,
    headers: parsed.headers,
    internalDate: parsed.internalDate,
    unread: flags.unread,
    starred: flags.starred,
    isDraft: flags.isDraft,
    isSent: flags.isSent,
    sizeEstimate: msg.sizeEstimate ?? null,
    historyId: msg.historyId ?? null,
  };
  await db
    .insert(_mailMessages)
    .values({ id: msg.id, accountId, ...envelope, ...body, ...attachmentFlag })
    .onConflictDoUpdate({
      target: _mailMessages.id,
      set: { ...envelope, ...body, ...attachmentFlag, updatedAt: new Date() },
    });

  // 3. Reconcile the message↔label join to exactly parsed.labelIds (labels are
  //    present in metadata too, so this runs on both metadata and full syncs).
  await ensureLabelsExist(accountId, parsed.labelIds);
  if (parsed.labelIds.length > 0) {
    await db
      .delete(_mailMessageLabels)
      .where(
        and(
          eq(_mailMessageLabels.messageId, msg.id),
          not(inArray(_mailMessageLabels.labelId, parsed.labelIds)),
        ),
      );
    await db
      .insert(_mailMessageLabels)
      .values(parsed.labelIds.map((labelId) => ({ messageId: msg.id, labelId })))
      .onConflictDoNothing();
  } else {
    await db
      .delete(_mailMessageLabels)
      .where(eq(_mailMessageLabels.messageId, msg.id));
  }

  // 4. Reconcile attachments ONLY on a full fetch. A `format=metadata` message
  //    carries no MIME parts, so its parsed attachment set is empty — running
  //    the reconcile there would wrongly wipe a hydrated message's attachments.
  //    Blob bytes are still not downloaded (storedAttachmentId stays null — lazy
  //    blob fetch is a later phase).
  if (full) {
    await db
      .delete(_mailAttachments)
      .where(eq(_mailAttachments.messageId, msg.id));
    if (parsed.attachments.length > 0) {
      await db.insert(_mailAttachments).values(
        parsed.attachments.map((a) => ({
          id: randomUUID(),
          messageId: msg.id,
          accountId,
          gmailAttachmentId: a.gmailAttachmentId,
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          inline: a.inline,
          contentId: a.contentId,
          storedAttachmentId: null,
        })),
      );
    }
  }

  // 5. Recompute the thread rollups from its (now-current) message set.
  await recomputeThread(accountId, msg.threadId);
}

/**
 * Metadata sync of one message: (re)write the envelope/flags/labels only, leaving
 * any cached body + attachments intact. Used by the bounded backfill and the
 * steady-state delta — the body is fetched lazily on first open.
 */
export function upsertMessageEnvelope(
  accountId: string,
  msg: GmailMessage,
): Promise<void> {
  return writeMessage(accountId, msg, false);
}

/**
 * Full (on-demand hydration) sync of one message: write the envelope AND the MIME
 * body + attachments, stamping `bodyFetchedAt`. Called when a message is opened.
 */
export function upsertMessageFull(
  accountId: string,
  msg: GmailMessage,
): Promise<void> {
  return writeMessage(accountId, msg, true);
}

/**
 * Positive-only mark that a set of messages have a (real, non-inline) attachment,
 * from Gmail's authoritative `has:attachment` signal (see `attachment-scan.ts`).
 * Only flips `false → true` (a message never loses an attachment — Gmail content
 * is immutable; a hydration still corrects the exact value), so re-runs are cheap
 * idempotent no-ops. Recomputes each distinct affected thread so its rollup flips.
 */
export async function markMessagesWithAttachments(
  accountId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const updated = await db
    .update(_mailMessages)
    .set({ hasAttachments: true, updatedAt: new Date() })
    .where(
      and(
        eq(_mailMessages.accountId, accountId),
        inArray(_mailMessages.id, ids),
        eq(_mailMessages.hasAttachments, false),
      ),
    )
    .returning({ threadId: _mailMessages.threadId });
  const threadIds = [...new Set(updated.map((r) => r.threadId))];
  for (const threadId of threadIds) {
    await recomputeThread(accountId, threadId);
  }
}

/** Recompute a thread's denormalized rollups from its messages, or delete it. */
export async function recomputeThread(
  accountId: string,
  threadId: string,
): Promise<void> {
  const messages = await db
    .select()
    .from(_mailMessages)
    .where(eq(_mailMessages.threadId, threadId))
    .orderBy(sql`${_mailMessages.internalDate} asc nulls first`);

  if (messages.length === 0) {
    await db.delete(_mailThreads).where(eq(_mailThreads.id, threadId));
    return;
  }

  const first = messages[0];
  const last = messages[messages.length - 1];
  // Unreachable after the length guard above; narrows for noUncheckedIndexedAccess.
  if (!first || !last) return;

  // Participants: de-duped by email across every message's from + to.
  const seen = new Set<string>();
  const participants: MailAddress[] = [];
  for (const m of messages) {
    for (const addr of [m.from, ...m.to]) {
      if (addr.email && !seen.has(addr.email)) {
        seen.add(addr.email);
        participants.push(addr);
      }
    }
  }

  let lastMessageAt: Date | null = null;
  for (const m of messages) {
    if (m.internalDate && (!lastMessageAt || m.internalDate > lastMessageAt)) {
      lastMessageAt = m.internalDate;
    }
  }

  const messageIds = messages.map((m) => m.id);
  const labelRows = await db
    .selectDistinct({ labelId: _mailMessageLabels.labelId })
    .from(_mailMessageLabels)
    .where(inArray(_mailMessageLabels.messageId, messageIds));
  const labelIds = labelRows.map((r) => r.labelId);

  await db
    .update(_mailThreads)
    .set({
      accountId,
      subject: first.subject,
      snippet: last.snippet,
      participants,
      lastMessageAt,
      messageCount: messages.length,
      unread: messages.some((m) => m.unread),
      starred: messages.some((m) => m.starred),
      important: labelIds.includes("IMPORTANT"),
      // derived from the message-level flag (scan- or hydration-populated)
      hasAttachments: messages.some((m) => m.hasAttachments),
      labelIds,
      updatedAt: new Date(),
    })
    .where(eq(_mailThreads.id, threadId));
}

/** Delete a message (cascading its labels/attachments) and recompute its thread. */
export async function deleteMessage(messageId: string): Promise<void> {
  const [row] = await db
    .select({
      threadId: _mailMessages.threadId,
      accountId: _mailMessages.accountId,
    })
    .from(_mailMessages)
    .where(eq(_mailMessages.id, messageId))
    .limit(1);
  await db.delete(_mailMessages).where(eq(_mailMessages.id, messageId));
  if (row) {
    await recomputeThread(row.accountId, row.threadId);
  }
}
