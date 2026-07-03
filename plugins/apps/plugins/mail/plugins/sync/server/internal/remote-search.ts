import { and, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { HttpError } from "@plugins/infra/plugins/endpoints/core";
import { listMessages } from "@plugins/apps/plugins/mail/plugins/gmail-api/server";
import {
  _mailAccounts,
  _mailMessages,
  _mailLabels,
  _mailMessageLabels,
  requireGmailToken,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import type {
  MailMessage,
  MailLabelRef,
} from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import type { MailSearchResult } from "../../core";
import { markMessagesWithAttachments, upsertMessageEnvelope } from "./store";
import { fetchEnvelopes } from "./fetch-envelopes";

// On-demand server-side search — the escape hatch for the bounded window. The
// backfill/delta only mirror envelopes `newer_than:${BACKFILL_WINDOW_DAYS}d`, so
// older mail simply isn't in the local mirror. This takes an arbitrary Gmail
// query, hits `messages.list?q=`, and FOLDS the matching envelopes into the same
// Postgres mirror via the existing idempotent `upsertMessageEnvelope`
// (list → metadata-fetch → upsert → read-back). Bodies still hydrate lazily on
// first open. Because every write is idempotent, a retried/paged search is safe.
//
// One page (25) per call; the caller pages via `nextPageToken`, and the `q`
// filter rides across pages. Results are returned in Gmail's relevance/recency
// order — the id order `messages.list` hands back, which a bare `inArray` read
// would NOT preserve, so we reorder through a `Map` after the read-back. Finally
// the ordered messages are folded into per-thread `MailSearchResult`s (Gmail-
// style thread collapse) with their user-label chips.

export async function remoteSearch(
  q: string,
  pageToken?: string,
): Promise<{ results: MailSearchResult[]; nextPageToken?: string }> {
  const query = q.trim();
  if (!query) return { results: [] };

  // Resolve the Gmail connection + the mirrored account it feeds. Search never
  // bootstraps an account (that is `ensureAccount`'s job on connect); a missing
  // token or account row means Gmail isn't set up, surfaced as a clean 409.
  const { accessToken, email } = await requireGmailToken().catch(() => {
    throw new HttpError(409, "Connect Gmail to search your mailbox.");
  });
  if (email == null) {
    throw new HttpError(409, "Connect Gmail to search your mailbox.");
  }
  const [account] = await db
    .select({ id: _mailAccounts.id })
    .from(_mailAccounts)
    .where(eq(_mailAccounts.email, email))
    .limit(1);
  if (!account) {
    throw new HttpError(409, "Connect Gmail to search your mailbox.");
  }
  const accountId = account.id;

  // Windowed `messages.list` with the caller's query — `q` rides every page.
  const list = await listMessages(accessToken, {
    q: query,
    pageToken,
    maxResults: 25,
  });
  const ids = (list.messages ?? []).map((m) => m.id);
  if (ids.length === 0) {
    return { results: [], nextPageToken: list.nextPageToken };
  }

  // Fetch envelopes (metadata-only, 404-tolerant) and fold each into the mirror.
  const { fetched } = await fetchEnvelopes(accessToken, ids);
  for (const m of fetched) {
    await upsertMessageEnvelope(accountId, m);
  }

  // Mark attachment-bearing results with Gmail's authoritative `has:attachment`
  // (matches the paperclip). One extra id-only list page for the same query,
  // intersected with this page's ids — metadata-only, no body fetch. First page
  // only: `has:attachment`'s first page spans a far wider recency range than the
  // 25-result query page, so it reliably covers this page's attachment bearers;
  // deep-page marking lands with real pagination.
  if (!pageToken) {
    const attachList = await listMessages(accessToken, {
      q: `${query} has:attachment`,
      maxResults: 100,
    });
    const attachIds = new Set((attachList.messages ?? []).map((m) => m.id));
    await markMessagesWithAttachments(
      accountId,
      ids.filter((id) => attachIds.has(id)),
    );
  }

  // Read the (now-mirrored) rows back and reorder to Gmail's `ids` order — a bare
  // `inArray` select does not preserve it. An id with no row (a 404'd/vanished
  // message that never landed) is dropped.
  const rows = await db
    .select()
    .from(_mailMessages)
    .where(inArray(_mailMessages.id, ids));
  const byId = new Map<string, MailMessage>(rows.map((r) => [r.id, r]));
  const orderedMessages = ids
    .map((id) => byId.get(id))
    .filter((r): r is MailMessage => r != null);

  // Fetch the USER labels for the matched messages (system labels excluded — they
  // are surfaced as flags, not chips) and index them by message id.
  const messageIds = orderedMessages.map((m) => m.id);
  const labelRows =
    messageIds.length === 0
      ? []
      : await db
          .select({
            messageId: _mailMessageLabels.messageId,
            id: _mailLabels.id,
            name: _mailLabels.name,
            color: _mailLabels.color,
            textColor: _mailLabels.textColor,
          })
          .from(_mailMessageLabels)
          .innerJoin(_mailLabels, eq(_mailMessageLabels.labelId, _mailLabels.id))
          .where(
            and(
              inArray(_mailMessageLabels.messageId, messageIds),
              eq(_mailLabels.type, "user"),
            ),
          );
  const labelsByMessage = new Map<string, MailLabelRef[]>();
  for (const row of labelRows) {
    const label: MailLabelRef = {
      id: row.id,
      name: row.name,
      color: row.color,
      textColor: row.textColor,
    };
    const existing = labelsByMessage.get(row.messageId);
    if (existing) existing.push(label);
    else labelsByMessage.set(row.messageId, [label]);
  }

  // Fold matched messages into per-thread results, preserving first-seen (Gmail-
  // ranked) thread order. Each group's representative is the newest matched member
  // by `internalDate`; flags OR across members; labels are the de-duped union.
  const dateOf = (m: MailMessage): number => m.internalDate?.getTime() ?? 0;
  const byThread = new Map<string, MailSearchResult>();
  for (const message of orderedMessages) {
    const existing = byThread.get(message.threadId);
    const labels = labelsByMessage.get(message.id) ?? [];
    if (!existing) {
      byThread.set(message.threadId, {
        threadId: message.threadId,
        message,
        messageCount: 1,
        unread: message.unread,
        starred: message.starred,
        hasAttachments: message.hasAttachments,
        labels: [...labels],
      });
      continue;
    }
    existing.messageCount += 1;
    existing.unread = existing.unread || message.unread;
    existing.starred = existing.starred || message.starred;
    existing.hasAttachments = existing.hasAttachments || message.hasAttachments;
    if (dateOf(message) > dateOf(existing.message)) existing.message = message;
    const seen = new Set(existing.labels.map((l) => l.id));
    for (const label of labels) {
      if (!seen.has(label.id)) {
        seen.add(label.id);
        existing.labels.push(label);
      }
    }
  }

  return { results: [...byThread.values()], nextPageToken: list.nextPageToken };
}
