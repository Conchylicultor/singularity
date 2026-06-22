/**
 * Failure taxonomy for the Ultimate Guitar fetch layer. Each `kind` is a
 * distinct, actionable breakage — the route layer maps these to HTTP statuses,
 * and the loud ones (signature rotation, shape change) are worth surfacing as
 * crash-worthy server-side failures rather than silently degrading.
 */
export type UgFetchErrorKind =
  | "invalid-url"
  | "not-found"
  | "signature-rejected"
  | "bad-request"
  | "upstream"
  | "malformed-response"
  | "network";

/** A controlled, classified failure of the UG fetch pipeline. */
export class UgFetchError extends Error {
  readonly kind: UgFetchErrorKind;

  constructor(
    kind: UgFetchErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "UgFetchError";
    this.kind = kind;
  }
}
