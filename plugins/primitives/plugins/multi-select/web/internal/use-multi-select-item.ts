import { useCallback, useMemo } from "react";
import { useMultiSelectContext } from "./multi-select-context";

export type MultiSelectItemHandle = {
  isSelected: boolean;
  isActive: boolean;
  toggle: (e: React.MouseEvent) => void;
};

export function useMultiSelectItem(id: string): MultiSelectItemHandle {
  const { state, dispatch } = useMultiSelectContext();

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      dispatch({ type: "TOGGLE", id, shiftKey: e.shiftKey });
    },
    [id, dispatch],
  );

  return useMemo(
    () => ({
      isSelected: state.selectedIds.has(id),
      isActive: state.isActive,
      toggle,
    }),
    [state.selectedIds, state.isActive, id, toggle],
  );
}
