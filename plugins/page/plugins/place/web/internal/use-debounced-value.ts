import { useEffect, useState } from "react";

/**
 * Returns `value` only after it has stayed unchanged for `delayMs` — what keeps
 * a type-ahead from firing a request per keystroke.
 *
 * `search/quick-find` keeps its own private copy of this six-liner. A third call
 * site is the point at which it earns a primitive of its own; a second one does
 * not, and extracting it now would mean a new plugin folder to hold six lines.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
