import { useMemo, useState } from "react";

export interface UseTextFilterOptions<T> {
  items: T[];
  accessor: (item: T) => string;
}

export interface TextFilterHandle<T> {
  query: string;
  setQuery: (q: string) => void;
  filtered: T[];
  isActive: boolean;
}

export function useTextFilter<T>({
  items,
  accessor,
}: UseTextFilterOptions<T>): TextFilterHandle<T> {
  const [query, setQuery] = useState("");
  const isActive = query.trim() !== "";
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      accessor(item).toLowerCase().includes(needle),
    );
  }, [items, accessor, query]);
  return { query, setQuery, filtered, isActive };
}
