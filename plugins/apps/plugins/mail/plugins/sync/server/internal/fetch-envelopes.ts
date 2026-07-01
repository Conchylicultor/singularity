import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import { getMessage } from "@plugins/apps/plugins/mail/plugins/gmail-api/server";
import {
  GmailApiError,
  type GmailMessage,
} from "@plugins/apps/plugins/mail/plugins/gmail-api/core";

// Concurrency-bounded fetch of message ENVELOPES (`format=metadata`: headers +
// snippet + labels, no body) that is TOLERANT of a per-id 404. A message can be
// deleted between being listed (backfill) or appearing in a history record
// (delta) and this fetch — a Gmail-side race. Without tolerance, that single 404
// (`GmailApiError` status 404 → classified terminal) would abort the entire
// backfill page / delta pass and dead-letter the whole sync, wedging the account
// permanently. So a 404'd id is reported as `missing` (gone on the server) for
// the caller to reconcile as a deletion; every other failure still propagates
// loudly (transient → the job retries; permanent auth/quota → surfaced).

export async function fetchEnvelopes(
  token: string,
  ids: string[],
): Promise<{ fetched: GmailMessage[]; missing: string[] }> {
  const sem = createSemaphore(8);
  const missing: string[] = [];
  const results = await Promise.all(
    ids.map((id) =>
      sem.run(async () => {
        try {
          return await getMessage(token, id, "metadata");
        } catch (err) {
          if (err instanceof GmailApiError && err.status === 404) {
            missing.push(id);
            return null;
          }
          throw err;
        }
      }),
    ),
  );
  return {
    fetched: results.filter((m): m is GmailMessage => m !== null),
    missing,
  };
}
