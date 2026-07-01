import { createContext, useContext, type ReactNode } from "react";
import type { DataViewId, FieldDef, ViewState } from "../../../core";
import type { ViewModel } from "../../internal/use-data-view-model";

/**
 * Everything a DataView settings contribution needs, exposed via context so a
 * setting component reads what it wants without prop-threading. Global-scope
 * contributions (e.g. custom-columns' "Fields" UI) read `storageKey` and resolve
 * the surface's config descriptor themselves via `getDataViewDescriptor`.
 */
export interface DataViewSettingsContextValue {
  storageKey: DataViewId;
  /** The merged field schema (incl. custom columns + field extensions). */
  fields: FieldDef<unknown>[];
  activeViewId: string;
  activeState: ViewState;
  viewModel: ViewModel;
  /** Whether the active view supports group-by (false → group-by control hides). */
  activeSupportsGroupBy: boolean;
}

const DataViewSettingsContext = createContext<DataViewSettingsContextValue | null>(
  null,
);

export function DataViewSettingsProvider(props: {
  value: DataViewSettingsContextValue;
  children: ReactNode;
}): ReactNode {
  return (
    <DataViewSettingsContext value={props.value}>
      {props.children}
    </DataViewSettingsContext>
  );
}

/** Read the DataView settings context. Throws outside a settings menu. */
export function useDataViewSettings(): DataViewSettingsContextValue {
  const ctx = useContext(DataViewSettingsContext);
  if (!ctx) {
    throw new Error(
      "useDataViewSettings must be used within the DataView settings menu",
    );
  }
  return ctx;
}
