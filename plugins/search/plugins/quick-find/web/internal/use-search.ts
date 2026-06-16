import { useEffect, useState } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { searchEndpoint } from "@plugins/search/plugins/engine/core";

// Debounce a value: returns the input only after it has stayed unchanged for
// `delayMs`. Keeps type-ahead search from firing a request on every keystroke.
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export interface UseSearchOptions {
  /** Restrict the search to these source ids (omit to search every source). */
  sources?: string[];
  /** Set false to suspend the query (e.g. while the dialog is closed). */
  enabled?: boolean;
}

// Debounced full-text search hook. Wraps the engine's search endpoint and only
// queries once the trimmed query is non-empty and has settled (~150ms).
export function useSearch(q: string, opts: UseSearchOptions = {}) {
  const debounced = useDebouncedValue(q.trim(), 150);
  const sources = opts.sources && opts.sources.length > 0 ? opts.sources.join(",") : undefined;
  return useEndpoint(
    searchEndpoint,
    {},
    {
      query: { q: debounced, sources },
      enabled: opts.enabled !== false && debounced.length > 0,
    },
  );
}
