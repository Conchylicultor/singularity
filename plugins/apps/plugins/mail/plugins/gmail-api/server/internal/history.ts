import type { GmailHistoryList } from "../../core";
import { gmailRequest } from "./request";

/**
 * List mailbox history since `startHistoryId`. `historyEndpoint: true` makes a
 * 404 (stale historyId) throw `GmailHistoryExpiredError` so the caller can fall
 * back to a full resync.
 */
export async function listHistory(
  token: string,
  opts: { startHistoryId: string; pageToken?: string; historyTypes?: string[] },
): Promise<GmailHistoryList> {
  return gmailRequest<GmailHistoryList>(token, "/history", {
    query: {
      startHistoryId: opts.startHistoryId,
      pageToken: opts.pageToken,
      historyTypes: opts.historyTypes,
    },
    historyEndpoint: true,
  });
}
