import { useCallback, useMemo, useState } from "react";

/**
 * Device-local active-instance selection. The active-id is *model* state (which
 * named instance the switcher has selected), so it lives in the engine — split
 * out of data-view's old `use-view-state.ts`. Persisted under
 * `${storageKey}:active-view`.
 *
 * localStorage access is DOMException-guarded (private-mode / quota safe).
 */
const ACTIVE_SUFFIX = ":active-view";

function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
    return null;
  }
}

function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
  }
}

export interface ActiveViewState {
  /** Persisted active-instance id (null → caller falls back to defaultView). */
  activeViewId: string | null;
  setActiveView: (viewId: string) => void;
}

export function useActiveViewId(storageKey: string): ActiveViewState {
  const activeKey = `${storageKey}${ACTIVE_SUFFIX}`;
  const [activeViewId, setActiveViewId] = useState<string | null>(() =>
    readString(activeKey),
  );

  const setActiveView = useCallback(
    (viewId: string) => {
      writeString(activeKey, viewId);
      setActiveViewId(viewId);
    },
    [activeKey],
  );

  return useMemo(
    () => ({ activeViewId, setActiveView }),
    [activeViewId, setActiveView],
  );
}
