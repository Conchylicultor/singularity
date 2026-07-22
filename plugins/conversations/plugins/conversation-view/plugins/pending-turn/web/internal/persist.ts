// Persistence idiom copied from persistent-draft's use-draft.ts: a `{v, ts}`
// envelope in localStorage, a custom window event for same-tab sync, and the
// native `storage` event for cross-tab sync. Generic over the payload so this
// module owns storage mechanics only — the record shape stays in store.ts.

const SYNC_EVENT = "singularity:pending-turns-updated";

type Envelope<T> = { v: T; ts: number };

export function pendingTurnsKey(conversationId: string): string {
  return `singularity:pending-turns:${conversationId}`;
}

export function readPendingTurns<T>(sKey: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(sKey);
    if (!raw) return fallback;
    const envelope = JSON.parse(raw) as Envelope<T>;
    return envelope.v;
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return fallback;
  }
}

export function writePendingTurns<T>(sKey: string, value: T): void {
  try {
    const envelope: Envelope<T> = { v: value, ts: Date.now() };
    localStorage.setItem(sKey, JSON.stringify(envelope));
    // eslint-disable-next-line promise-safety/no-bare-catch -- quota exceeded: the in-memory store stays authoritative for this tab (durability degrades, the UI does not); mirrors use-draft.ts
  } catch {
    // Quota exceeded — silently ignore
  }
  window.dispatchEvent(
    new CustomEvent(SYNC_EVENT, { detail: { storageKey: sKey } }),
  );
}

export function clearPendingTurns(sKey: string): void {
  try {
    localStorage.removeItem(sKey);
    // eslint-disable-next-line promise-safety/no-bare-catch -- storage unavailable: nothing to clear; mirrors use-draft.ts
  } catch {
    // ignore
  }
  window.dispatchEvent(
    new CustomEvent(SYNC_EVENT, { detail: { storageKey: sKey } }),
  );
}

export function subscribePendingTurns(
  sKey: string,
  onChange: () => void,
): () => void {
  const handleCustom = (e: Event) => {
    const ce = e as CustomEvent<{ storageKey: string }>;
    if (ce.detail.storageKey === sKey) onChange();
  };
  const handleStorage = (e: StorageEvent) => {
    if (e.key === sKey) onChange();
  };
  window.addEventListener(SYNC_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(SYNC_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}
