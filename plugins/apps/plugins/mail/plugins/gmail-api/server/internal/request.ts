import { retryUntil, exponential, withJitter } from "@plugins/packages/plugins/retry/core";
import { GmailApiError, GmailHistoryExpiredError } from "../../core";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Shape of Gmail's JSON error envelope. */
interface GmailErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: { reason?: string; message?: string }[];
  };
}

/** Reasons Gmail returns that mean "slow down and retry" rather than "give up". */
const RETRYABLE_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "backendError",
]);

/** Parse the `{ error: { errors: [{ reason }], message } }` envelope, tolerating non-JSON bodies. */
function parseError(bodyText: string): { reason?: string; message?: string } {
  try {
    const body = JSON.parse(bodyText) as GmailErrorBody;
    const reason = body.error?.errors?.[0]?.reason;
    const message = body.error?.message ?? bodyText;
    return { reason, message };
  } catch (err) {
    // The only thrower here is JSON.parse on a non-JSON body — a normal case
    // for some Gmail error responses. Anything else is unexpected: re-throw.
    if (!(err instanceof SyntaxError)) throw err;
    return { message: bodyText };
  }
}

/**
 * Single entry point for every Gmail REST call. Stateless: the caller supplies
 * the access token on each invocation, so this module never touches auth.
 *
 * Retry contract (see `retryUntil`): the inner fn returning a non-null value =
 * success; returning `null` = retry (after exponential backoff with jitter);
 * throwing = propagate immediately. We map:
 *   - 2xx                                    → return parsed JSON object (success)
 *   - 404 + historyEndpoint                  → throw GmailHistoryExpiredError (no retry)
 *   - 429 / 403-rate-limit / 5xx             → return null (back off and retry)
 *   - any other non-ok                       → throw GmailApiError (no retry)
 * The 120s `deadline` (a DURATION, per retryUntil's `Date.now() - start >= deadline`
 * check) caps total retry time; on expiry retryUntil throws RetryDeadlineError,
 * which we deliberately let propagate (loud failure).
 */
export async function gmailRequest<T>(
  token: string,
  path: string,
  init?: {
    method?: string;
    query?: Record<string, string | string[] | undefined>;
    historyEndpoint?: boolean;
  },
): Promise<T> {
  const url = new URL(GMAIL_BASE + path);
  if (init?.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        // Gmail uses repeated params (e.g. labelIds=, historyTypes=).
        for (const v of value) url.searchParams.append(key, v);
      } else {
        url.searchParams.append(key, value);
      }
    }
  }

  return retryUntil<T>(
    async () => {
      const res = await fetch(url, {
        method: init?.method ?? "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        // Gmail responses are always JSON objects; wrapping is unnecessary.
        return (await res.json()) as T;
      }

      if (res.status === 404 && init?.historyEndpoint) {
        // Stale historyId — non-retryable; caller must full-resync.
        throw new GmailHistoryExpiredError();
      }

      const bodyText = await res.text();
      const { reason, message } = parseError(bodyText);

      const isRateLimited =
        res.status === 429 ||
        (res.status === 403 && reason != null && RETRYABLE_REASONS.has(reason)) ||
        res.status >= 500;

      if (isRateLimited) {
        // Signal retryUntil to back off and retry.
        return null;
      }

      // Permanent failure — propagate out of retryUntil.
      throw new GmailApiError(
        res.status,
        message ?? `Gmail request failed (${res.status})`,
        reason,
      );
    },
    {
      delay: withJitter(exponential({ initial: 500, max: 30_000 })),
      deadline: 120_000,
    },
  );
}
