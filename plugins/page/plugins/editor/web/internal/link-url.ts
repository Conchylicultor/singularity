/**
 * URL validation + normalization for inline links. The block editor allows
 * `http`/`https`/`mailto` only; a bare `example.com` (typed in the link popover)
 * is normalized to `https://example.com` so the persisted href is always a real,
 * clickable URL. Anything else (javascript:, relative, garbage) is rejected so a
 * malformed token can never become a live href.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** Whether `url` is a structurally valid, allowed-protocol absolute URL. */
export function isValidLinkUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch (err) {
    // `new URL` throws a TypeError for an unparseable URL — that IS "invalid".
    // Anything else is an unexpected failure and must surface.
    if (err instanceof TypeError) return false;
    throw err;
  }
}

/**
 * Normalize a user-typed link target to a canonical href, or `null` if it can't
 * be made valid. An `@`-bearing bare token becomes `mailto:`; an explicit allowed
 * scheme passes through; anything else is prefixed with `https://` and re-checked.
 */
export function normalizeLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isValidLinkUrl(trimmed)) return trimmed;
  // Bare email → mailto.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    const mailto = `mailto:${trimmed}`;
    return isValidLinkUrl(mailto) ? mailto : null;
  }
  const https = `https://${trimmed}`;
  return isValidLinkUrl(https) ? https : null;
}
