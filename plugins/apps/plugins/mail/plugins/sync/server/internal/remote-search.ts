import { eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { HttpError } from "@plugins/infra/plugins/endpoints/core";
import { listMessages } from "@plugins/apps/plugins/mail/plugins/gmail-api/server";
import {
  _mailAccounts,
  _mailMessages,
  requireGmailToken,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import type { MailMessage } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { upsertMessageEnvelope } from "./store";
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
// would NOT preserve, so we reorder through a `Map` after the read-back.

export async function remoteSearch(
  q: string,
  pageToken?: string,
): Promise<{ results: MailMessage[]; nextPageToken?: string }> {
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

  // Read the (now-mirrored) rows back and reorder to Gmail's `ids` order — a bare
  // `inArray` select does not preserve it. An id with no row (a 404'd/vanished
  // message that never landed) is dropped.
  const rows = await db
    .select()
    .from(_mailMessages)
    .where(inArray(_mailMessages.id, ids));
  const byId = new Map<string, MailMessage>(rows.map((r) => [r.id, r]));
  const results = ids
    .map((id) => byId.get(id))
    .filter((r): r is MailMessage => r != null);

  return { results, nextPageToken: list.nextPageToken };
}
