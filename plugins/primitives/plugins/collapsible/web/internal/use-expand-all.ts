import { useCallback, useState } from "react";

export interface UseExpandAllReturn {
  expanded: ReadonlySet<string>;
  allExpanded: boolean;
  toggleAll: () => void;
  toggle: (id: string) => void;
}

export function useExpandAll(ids: readonly string[]): UseExpandAllReturn {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const allExpanded =
    ids.length > 0 && ids.every((id) => expanded.has(id));

  const toggleAll = useCallback(() => {
    setExpanded((prev) => {
      const all = ids.length > 0 && ids.every((id) => prev.has(id));
      return all ? new Set() : new Set(ids);
    });
  }, [ids]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return { expanded, allExpanded, toggleAll, toggle };
}
