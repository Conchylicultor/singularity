import { useCallback, useMemo } from "react";
import { useMultiSelectContext } from "./multi-select-context";

export type MultiSelectHandle = {
  selectedIds: ReadonlySet<string>;
  selectedCount: number;
  isActive: boolean;
  selectAll: () => void;
  clearAll: () => void;
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

  return useMemo(
    () => ({
      selectedIds: state.selectedIds,
      selectedCount: state.selectedIds.size,
      isActive: state.isActive,
      selectAll,
      clearAll,
    }),
    [state.selectedIds, state.isActive, selectAll, clearAll],
  );
}
