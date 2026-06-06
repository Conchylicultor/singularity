import { useCallback, useMemo } from "react";
import { useMultiSelectContext } from "./multi-select-context";

export type MultiSelectHandle = {
  selectedIds: ReadonlySet<string>;
  selectedCount: number;
  isActive: boolean;
  selectAll: () => void;
  clearAll: () => void;
  /**
   * Replace the selection with the contiguous range [anchorId..targetId] in the
   * provider's ordered ids. Document-style range select for shift-click,
   * keyboard Shift+Arrow, and marquee drag. No-op if either id is unknown.
   */
  setRange: (anchorId: string, targetId: string) => void;
};

export function useMultiSelect(): MultiSelectHandle {
  const { state, dispatch } = useMultiSelectContext();

  const selectAll = useCallback(
    () => dispatch({ type: "SELECT_ALL" }),
    [dispatch],
  );
  const clearAll = useCallback(
    () => dispatch({ type: "CLEAR_ALL" }),
    [dispatch],
  );
  const setRange = useCallback(
    (anchorId: string, targetId: string) =>
      dispatch({ type: "SET_RANGE", anchorId, targetId }),
    [dispatch],
  );

  return useMemo(
    () => ({
      selectedIds: state.selectedIds,
      selectedCount: state.selectedIds.size,
      isActive: state.isActive,
      selectAll,
      clearAll,
      setRange,
    }),
    [state.selectedIds, state.isActive, selectAll, clearAll, setRange],
  );
}
