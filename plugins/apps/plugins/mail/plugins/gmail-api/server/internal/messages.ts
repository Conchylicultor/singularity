import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import type { GmailMessage, GmailMessageList } from "../../core";
import { gmailRequest } from "./request";

export async function listMessages(
  token: string,
  opts?: { pageToken?: string; q?: string; labelIds?: string[]; maxResults?: number },
): Promise<GmailMessageList> {
  return gmailRequest<GmailMessageList>(token, "/messages", {
    query: {
      pageToken: opts?.pageToken,
      q: opts?.q,
      labelIds: opts?.labelIds,
      maxResults: opts?.maxResults?.toString(),
    },
  });
}

export async function getMessage(
  token: string,
  id: string,
  format = "full",
): Promise<GmailMessage> {
  return gmailRequest<GmailMessage>(token, `/messages/${encodeURIComponent(id)}`, {
    query: { format },
  });
}

/**
 * Concurrency-bounded parallel `getMessage` over `ids`, preserving input order.
 * Google's JSON-batch endpoint is deprecated, so "batched" here means a bounded
 * fan-out (8 in flight) rather than a single multipart request. A per-message
 * failure rejects the whole `Promise.all` on purpose — the caller's job retries
 * the page and upserts are idempotent.
 */
export async function batchGetMessages(
  token: string,
  ids: string[],
): Promise<GmailMessage[]> {
  const sem = createSemaphore(8);
  return Promise.all(ids.map((id) => sem.run(() => getMessage(token, id))));
}
