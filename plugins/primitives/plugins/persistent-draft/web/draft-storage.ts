/**
 * The storage half of persistent-draft: key grammar, TTL envelope, and the
 * same-tab/cross-tab sync event — with no React attached.
 *
 * `useDraft` is a `useState` drop-in, so every write re-renders its subscribers.
 * That is right for a text draft and wrong for anything written at input
 * frequency (a scroll offset, a cursor position): those callers want the same
 * envelope, TTL and key grammar without a render per write. Rather than let them
 * hand-roll a second copy of this file, both halves share it — `useDraft` is now
 * the reactive wrapper over these functions.
 */

export const DRAFT_SYNC_EVENT = "singularity:draft-updated";
export const DEFAULT_DRAFT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

type Envelope<T> = { v: T; ts: number };

export interface DraftOptions {
  scope?: string;
  ttl?: number;
}

export function draftKey(key: string, scope?: string): string {
  return scope ? `singularity:draft:${key}:${scope}` : `singularity:draft:${key}`;
}

/**
 * Read a stored value, or `null` when there is nothing usable to read.
 *
 * `null` covers absent, TTL-expired and unparseable alike — and that is a
 * legitimate empty success rather than an absorbed failure: for a draft, all
 * three mean "no draft to restore", the exact state a first visit produces, and
 * every caller already has to handle it. Callers needing to distinguish "saved
 * but no longer resolvable" must do so against their own domain (see
 * `auto-scroll`'s `resolveRestore`, which separates `none` from `missing`).
 */
export function readDraft<T>(key: string, options?: DraftOptions): T | null {
  const sKey = draftKey(key, options?.scope);
  const ttl = options?.ttl ?? DEFAULT_DRAFT_TTL;
  try {
    const raw = localStorage.getItem(sKey);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as Envelope<T>;
    if (Date.now() - envelope.ts > ttl) {
      localStorage.removeItem(sKey);
      return null;
    }
    return envelope.v;
  } catch (err) {
    // A DOMException means storage is unavailable (private mode / blocked) — an
    // environment condition. A SyntaxError means our own bytes are unreadable.
    // Neither has a recovery path better than "no draft"; anything else is a
    // real bug and must not be swallowed.
    if (err instanceof SyntaxError || err instanceof DOMException) return null;
    throw err;
  }
}

export function writeDraft<T>(
  key: string,
  value: T,
  options?: DraftOptions,
): void {
  const sKey = draftKey(key, options?.scope);
  try {
    const envelope: Envelope<T> = { v: value, ts: Date.now() };
    localStorage.setItem(sKey, JSON.stringify(envelope));
    window.dispatchEvent(
      new CustomEvent(DRAFT_SYNC_EVENT, { detail: { storageKey: sKey } }),
    );
  } catch (err) {
    // Quota exhaustion and blocked storage are the two expected failures, and a
    // draft that cannot be persisted must never break the surface the user is
    // typing into. Anything else rethrows.
    if (err instanceof DOMException) return;
    throw err;
  }
}

export function clearDraft(key: string, options?: DraftOptions): void {
  const sKey = draftKey(key, options?.scope);
  try {
    localStorage.removeItem(sKey);
    window.dispatchEvent(
      new CustomEvent(DRAFT_SYNC_EVENT, { detail: { storageKey: sKey } }),
    );
  } catch (err) {
    if (err instanceof DOMException) return;
    throw err;
  }
}
