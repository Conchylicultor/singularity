import type { BrowserFetchFailureKind } from "./types";

/**
 * Everything that prevented reading the page at all.
 *
 * `name` is set in the constructor because classification downstream is
 * **name-based**, not `instanceof`-based: the error crosses a plugin boundary
 * and may cross a module-instance boundary with it, and a name comparison
 * survives both. `kind` is the machine-readable half; the message is the
 * human-readable one.
 *
 * Note what this class deliberately does NOT wrap: `SsrfError`. A refusal to
 * reach a private address propagates unwrapped, so a caller that already
 * classifies `SsrfError` as terminal keeps classifying it identically whether
 * the read went through `safeFetch` or through a browser. Wrapping it would
 * silently downgrade a terminal security refusal into an anonymous transient.
 */
export class BrowserFetchError extends Error {
  readonly kind: BrowserFetchFailureKind;
  readonly url: string;

  constructor(
    kind: BrowserFetchFailureKind,
    url: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "BrowserFetchError";
    this.kind = kind;
    this.url = url;
  }
}

/**
 * The "no chromium" error. The remedy is in the message on purpose: this is the
 * one failure an operator can fix in one command, and the provisioning step that
 * normally prevents it runs at install time — hours before anyone reads this.
 */
export function browserUnavailable(
  url: string,
  cause: unknown,
): BrowserFetchError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new BrowserFetchError(
    "browser-unavailable",
    url,
    `Could not start a browser to load ${url}. ` +
      `Run \`bun run playwright install chromium\` to provision it. (${detail})`,
    { cause },
  );
}
