import { createContext, useContext, useReducer, type Dispatch } from "react";

export type MultiSelectState = {
  orderedIds: readonly string[];
  selectedIds: Set<string>;
  anchorId: string | null;
  isActive: boolean;
};

export type MultiSelectAction =
  | { type: "TOGGLE"; id: string; shiftKey: boolean }
  | { type: "SET_RANGE"; anchorId: string; targetId: string }
  | { type: "SELECT_ALL" }
  | { type: "CLEAR_ALL" }
  | { type: "SET_ORDERED_IDS"; ids: readonly string[] };

type MultiSelectContextValue = {
  state: MultiSelectState;
  dispatch: Dispatch<MultiSelectAction>;
};

const MultiSelectContext = createContext<MultiSelectContextValue | null>(null);

export function useMultiSelectContext(): MultiSelectContextValue {
  const ctx = useContext(MultiSelectContext);
  if (!ctx)
    throw new Error("useMultiSelect* must be used inside <MultiSelectProvider>");
  return ctx;
}

export { MultiSelectContext };

function shallowEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function toggleRange(
  state: MultiSelectState,
  id: string,
): Set<string> {
  const { orderedIds, anchorId, selectedIds } = state;
  if (!anchorId) return new Set([...selectedIds, id]);

  const anchorIdx = orderedIds.indexOf(anchorId);
  const targetIdx = orderedIds.indexOf(id);
  if (anchorIdx === -1 || targetIdx === -1) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  const lo = Math.min(anchorIdx, targetIdx);
  const hi = Math.max(anchorIdx, targetIdx);
  const next = new Set(selectedIds);
  for (let i = lo; i <= hi; i++) {
    next.add(orderedIds[i]!);
  }
  return next;
}

export function multiSelectReducer(
  state: MultiSelectState,
  action: MultiSelectAction,
): MultiSelectState {
  switch (action.type) {
    case "TOGGLE": {
      const { id, shiftKey } = action;

      if (shiftKey) {
        const nextSelected = toggleRange(state, id);
        return {
          ...state,
          selectedIds: nextSelected,
          isActive: nextSelected.size > 0,
        };
      }

      // Plain click or meta/ctrl click — toggle single item
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return {
        ...state,
        selectedIds: next,
        anchorId: id,
        isActive: next.size > 0,
      };
    }

    case "SET_RANGE": {
      // Replace the selection with exactly the contiguous range
      // [anchorId..targetId] (document-style range select, as opposed to the
      // additive TOGGLE+shift behavior). No-op if either id is unknown.
      const { anchorId, targetId } = action;
      const anchorIdx = state.orderedIds.indexOf(anchorId);
      const targetIdx = state.orderedIds.indexOf(targetId);
      if (anchorIdx === -1 || targetIdx === -1) return state;
      const lo = Math.min(anchorIdx, targetIdx);
      const hi = Math.max(anchorIdx, targetIdx);
      const next = new Set<string>();
      for (let i = lo; i <= hi; i++) next.add(state.orderedIds[i]!);
      return {
        ...state,
        selectedIds: next,
        anchorId,
        isActive: next.size > 0,
      };
    }

    case "SELECT_ALL": {
      const all = new Set(state.orderedIds);
      return {
        ...state,
        selectedIds: all,
        isActive: all.size > 0,
      };
    }

    case "CLEAR_ALL":
      return {
        ...state,
        selectedIds: new Set(),
        anchorId: null,
        isActive: false,
      };

    case "SET_ORDERED_IDS": {
      if (shallowEqual(state.orderedIds, action.ids)) return state;
      // Prune selected IDs that are no longer in the ordered set
      const idSet = new Set(action.ids);
      const pruned = new Set<string>();
      for (const id of state.selectedIds) {
        if (idSet.has(id)) pruned.add(id);
      }
      const anchorId =
        state.anchorId && idSet.has(state.anchorId) ? state.anchorId : null;
      return {
        orderedIds: action.ids,
        selectedIds: pruned,
        anchorId,
        isActive: pruned.size > 0,
      };
    }
  }
}

const initialState: MultiSelectState = {
  orderedIds: [],
  selectedIds: new Set(),
  anchorId: null,
  isActive: false,
};

export function useMultiSelectReducer() {
  return useReducer(multiSelectReducer, initialState);
}
