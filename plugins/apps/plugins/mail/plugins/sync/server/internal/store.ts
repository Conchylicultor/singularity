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

/** Parse + upsert one Gmail message, reconciling labels/attachments + thread. */
export async function upsertMessage(
  accountId: string,
  msg: GmailMessage,
): Promise<void> {
  const parsed = parseGmailMessage(msg);
  const flags = flagsFromLabels(parsed.labelIds);

  // 1. Ensure the FK-parent thread stub exists before inserting the message.
  await db
    .insert(_mailThreads)
    .values({ id: msg.threadId, accountId })
    .onConflictDoNothing();

  // 2. Upsert the message envelope + bodies + derived flags.
  await db
    .insert(_mailMessages)
    .values({
      id: msg.id,
      threadId: msg.threadId,
      accountId,
      from: parsed.from,
      to: parsed.to,
      cc: parsed.cc,
      bcc: parsed.bcc,
      replyTo: parsed.replyTo,
      subject: parsed.subject,
      snippet: parsed.snippet,
      headers: parsed.headers,
      bodyText: parsed.bodyText,
      bodyHtml: parsed.bodyHtml,
      internalDate: parsed.internalDate,
      unread: flags.unread,
      starred: flags.starred,
      isDraft: flags.isDraft,
      isSent: flags.isSent,
      sizeEstimate: msg.sizeEstimate ?? null,
      historyId: msg.historyId ?? null,
    })
    .onConflictDoUpdate({
      target: _mailMessages.id,
      set: {
        threadId: msg.threadId,
        from: parsed.from,
        to: parsed.to,
        cc: parsed.cc,
        bcc: parsed.bcc,
        replyTo: parsed.replyTo,
        subject: parsed.subject,
        snippet: parsed.snippet,
        headers: parsed.headers,
        bodyText: parsed.bodyText,
        bodyHtml: parsed.bodyHtml,
        internalDate: parsed.internalDate,
        unread: flags.unread,
        starred: flags.starred,
        isDraft: flags.isDraft,
        isSent: flags.isSent,
        sizeEstimate: msg.sizeEstimate ?? null,
        historyId: msg.historyId ?? null,
        updatedAt: new Date(),
      },
    });

  // 3. Reconcile the message↔label join to exactly parsed.labelIds.
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

  // 4. Reconcile attachments: drop + re-insert the parsed set (a message's
  //    attachment set is effectively immutable for a given id; simplest correct
  //    reconcile). Blob bytes are not downloaded in this phase
  //    (storedAttachmentId stays null — lazy fetch is a later phase).
  await db.delete(_mailAttachments).where(eq(_mailAttachments.messageId, msg.id));
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

  // 5. Recompute the thread rollups from its (now-current) message set.
  await recomputeThread(accountId, msg.threadId);
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

  const attachmentRows = await db
    .select({ id: _mailAttachments.id })
    .from(_mailAttachments)
    .where(inArray(_mailAttachments.messageId, messageIds))
    .limit(1);

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
      hasAttachments: attachmentRows.length > 0,
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
