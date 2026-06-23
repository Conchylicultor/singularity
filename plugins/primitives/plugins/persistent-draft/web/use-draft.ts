import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const SYNC_EVENT = "singularity:draft-updated";
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

type Envelope<T> = { v: T; ts: number };

function buildKey(key: string, scope?: string): string {
  return scope ? `singularity:draft:${key}:${scope}` : `singularity:draft:${key}`;
}

function readFromStorage<T>(sKey: string, fallback: T, ttl: number): T {
  try {
    const raw = localStorage.getItem(sKey);
    if (!raw) return fallback;
    const envelope = JSON.parse(raw) as Envelope<T>;
    if (Date.now() - envelope.ts > ttl) {
      localStorage.removeItem(sKey);
      return fallback;
    }
    return envelope.v;
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return fallback;
  }
}

function writeToStorage<T>(sKey: string, value: T): void {
  try {
    const envelope: Envelope<T> = { v: value, ts: Date.now() };
    localStorage.setItem(sKey, JSON.stringify(envelope));
    window.dispatchEvent(
      new CustomEvent(SYNC_EVENT, { detail: { storageKey: sKey } }),
    );
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch {
    // Quota exceeded — silently ignore
  }
}

/**
 * Drop-in for useState backed by localStorage with optional entity scope and TTL.
 * All useDraft calls sharing the same resolved key stay in sync within the tab
 * via a custom window event, and across tabs via the native storage event.
 */
export function useDraft<T>(
  key: string,
  initialValue: T | (() => T),
  options?: { scope?: string; ttl?: number },
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const sKey = buildKey(key, options?.scope);
  const ttl = options?.ttl ?? DEFAULT_TTL;

  // Resolve initialValue once via useState lazy-init: a stable value (its setter
  // is never called) that can seed the storage read and the effect deps without
  // a render-phase ref read.
  const [resolvedInitial] = useState<T>(() =>
    typeof initialValue === "function"
      ? (initialValue as () => T)()
      : initialValue,
  );

  const [value, setValueState] = useState<T>(() =>
    readFromStorage(sKey, resolvedInitial, ttl),
  );

  // Re-read when sKey changes (e.g. navigating to a different conversation).
  const prevSKeyRef = useRef(sKey);
  useEffect(() => {
    if (prevSKeyRef.current !== sKey) {
      prevSKeyRef.current = sKey;
      setValueState(readFromStorage(sKey, resolvedInitial, ttl));
    }
  }, [sKey, resolvedInitial, ttl]);

  const setValue: Dispatch<SetStateAction<T>> = useCallback(
    (action) => {
      setValueState((prev) => {
        const next =
          typeof action === "function"
            ? (action as (prev: T) => T)(prev)
            : action;
        writeToStorage(sKey, next);
        return next;
      });
    },
    [sKey],
  );

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(sKey);
      window.dispatchEvent(
        new CustomEvent(SYNC_EVENT, { detail: { storageKey: sKey } }),
      );
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch {
      // ignore
    }
    setValueState(resolvedInitial);
  }, [sKey, resolvedInitial]);

  // Sync with other useDraft hooks on the same key (same-tab and cross-tab).
  useEffect(() => {
    const handleCustom = (e: Event) => {
      const ce = e as CustomEvent<{ storageKey: string }>;
      if (ce.detail.storageKey === sKey) {
        setValueState(readFromStorage(sKey, resolvedInitial, ttl));
      }
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === sKey) {
        setValueState(readFromStorage(sKey, resolvedInitial, ttl));
      }
    };
    window.addEventListener(SYNC_EVENT, handleCustom);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(SYNC_EVENT, handleCustom);
      window.removeEventListener("storage", handleStorage);
    };
  }, [sKey, resolvedInitial, ttl]);

  return [value, setValue, clearDraft];
}
