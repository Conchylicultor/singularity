// Typed Gmail client errors. These are runtime values (classes), but they live
// in `core` so both the server client and any future caller can share the exact
// error types when narrowing in `catch` blocks.

/** Thrown when Gmail rejects a stale historyId (404 on history.list) → caller must full-resync. */
export class GmailHistoryExpiredError extends Error {
  constructor(message = "Gmail historyId expired") {
    super(message);
    this.name = "GmailHistoryExpiredError";
  }
}

/** Non-retryable Gmail API failure (4xx other than rate-limit). */
export class GmailApiError extends Error {
  readonly status: number;
  readonly reason?: string;
  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.name = "GmailApiError";
    this.status = status;
    this.reason = reason;
  }
}
