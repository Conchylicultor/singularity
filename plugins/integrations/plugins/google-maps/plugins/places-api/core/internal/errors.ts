/**
 * A Places API call that did not return 2xx. Carries Google's own error text
 * (`REQUEST_DENIED`, "API not enabled", "billing not enabled", …) so the reason
 * survives all the way to whoever has to fix it.
 *
 * A runtime value (a class), but it lives in `core` so any caller can narrow on
 * it in a `catch` — the same placement as gmail-api's `GmailApiError`.
 */
export class PlacesApiError extends Error {
  readonly status: number;
  /** Google's `error.status` enum, e.g. "PERMISSION_DENIED". */
  readonly reason?: string;

  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.name = "PlacesApiError";
    this.status = status;
    this.reason = reason;
  }
}
