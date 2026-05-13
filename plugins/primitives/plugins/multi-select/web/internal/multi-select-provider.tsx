import { useEffect, type ReactElement, type ReactNode } from "react";
import {
  MultiSelectContext,
  useMultiSelectReducer,
} from "./multi-select-context";

export type MultiSelectProviderProps = {
  orderedIds: readonly string[];
  children: ReactNode;
};

export function MultiSelectProvider({
  orderedIds,
  children,
}: MultiSelectProviderProps): ReactElement {
  const [state, dispatch] = useMultiSelectReducer();

  useEffect(() => {
    dispatch({ type: "SET_ORDERED_IDS", ids: orderedIds });
  }, [orderedIds, dispatch]);

  return (
    <MultiSelectContext value={{ state, dispatch }}>
      {children}
    </MultiSelectContext>
  );
}
