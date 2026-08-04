// Maps any failure thrown out of a source type's `probe` / `extract` onto a
// classification: a stable code the UI can hang remediation copy off, a short
// readable message, and — the load-bearing bit — whether it is TERMINAL.
//
// Terminal means "the same stored input will fail identically on every retry":
// the engine writes `status: "error"` + the classified error onto the source row
// and rethrows as a `NonRetryableError`, so graphile dead-letters after ONE
// attempt instead of burning the retry budget (and, for the URL extractor,
// paying for three model calls to learn the same thing). Transient means a later
// attempt could succeed, so the failure stays on the run row and graphile
// retries.
//
// Pure — no DB, no IO, no imports that touch either — so it is unit-testable in
// isolation, mirroring mail-sync's `classify-error.ts`.

/**
 * Why a refresh failed, coarsely. Free text on the row (`lastErrorCode` is a
 * plain text column), so adding a code costs no migration.
 */
export type RefreshErrorCode =
  /** The source names a type no composition installed, or its config is invalid. */
  | "config"
  /** The target resolved to a private/loopback/link-local address — SSRF refusal. */
  | "blocked_url"
  /** The extractor produced something that is not a valid `ExtractedEvent[]`. */
  | "extraction"
  /** The source type declared its own failure permanent. */
  | "source"
  /** Unrecognised — assumed transient, so a network blip retries. */
  | "unknown";

export interface RefreshErrorClassification {
  code: RefreshErrorCode;
  message: string;
  terminal: boolean;
}

const MAX_MESSAGE_LEN = 300;

/** Trim an arbitrary error message to one short, user-readable value. */
function shortMessage(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.length > MAX_MESSAGE_LEN
    ? `${trimmed.slice(0, MAX_MESSAGE_LEN - 1)}…`
    : trimmed;
}

/**
 * Match by `error.name`, never `instanceof`.
 *
 * Both classes we recognise set `this.name` in their constructor, and a name
 * check survives the module-identity differences (HMR, worker threads, a plugin
 * resolved through two paths) that make `instanceof` silently return false —
 * which here would misclassify a terminal failure as transient and retry it.
 * `NonRetryableError` itself carries a global `Symbol.for` brand for exactly
 * this reason; the brand check is not exported, so the name is the next-best
 * identity-proof signal, and it keeps this module import-free.
 */
function errorName(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const { name } = err as { name?: unknown };
  return typeof name === "string" ? name : undefined;
}

/** Whether the engine should skip the retry budget for this failure. */
export function isNonRetryable(err: unknown): boolean {
  return errorName(err) === "NonRetryableError";
}

export function classifyRefreshError(
  err: unknown,
): RefreshErrorClassification {
  const message = shortMessage(
    err instanceof Error ? err.message : String(err),
  );
  const name = errorName(err);

  // The source type itself declared the failure permanent (a 404 page, a
  // revoked API key, an unparseable model response). It knows more than we do.
  if (name === "NonRetryableError") {
    return { code: "source", message, terminal: true };
  }

  // `safeFetch` / `parsePublicUrl` refused the target. No retry reaches a
  // different address, and the user must fix the URL.
  if (name === "SsrfError") {
    return { code: "blocked_url", message, terminal: true };
  }

  // The extractor's output failed `ExtractedEventSchema` — contract drift, not a
  // blip. Retrying re-pays for the same malformed answer.
  if (name === "ZodError") {
    return { code: "extraction", message, terminal: true };
  }

  // A misconfigured / uninstalled source type: the engine raises this itself
  // before ever reaching the source type (see `run-source.ts`).
  if (name === "UnknownSourceTypeError") {
    return { code: "config", message, terminal: true };
  }

  // Everything else — a timeout, a 5xx, a DNS hiccup, a dropped socket — is
  // assumed recoverable. Guessing "transient" for the unknown case is the safe
  // default: the cost is at most `maxAttempts` retries, whereas guessing
  // "terminal" would park a healthy source in an error state until a human
  // noticed.
  return { code: "unknown", message, terminal: false };
}
