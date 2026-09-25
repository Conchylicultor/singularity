import {
  createContext,
  useContext,
  useMemo,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  usePanelStack,
  type PanelStackApi,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";

/**
 * A component that re-provides the filter editor's tree — a nested
 * `DataViewControlsProvider` whose `filter` controller edits some OTHER
 * `FilterGroup` than the view's filter (the fold rule's `keep`). It computes that
 * controller itself, from hooks, every render.
 */
export type FilterScope = ComponentType<{ children: ReactNode }>;

const FilterScopeContext = createContext<FilterScope | null>(null);

/** Mark `children` as editing inside `scope`. The scope component renders this
 *  around its own children, so every page pushed from inside inherits it. */
export function FilterScopeProvider({
  scope,
  children,
}: {
  scope: FilterScope;
  children: ReactNode;
}): ReactNode {
  return <FilterScopeContext value={scope}>{children}</FilterScopeContext>;
}

/**
 * `usePanelStack()` for the filter builder's own sub-pages (nested groups, the
 * add-filter field list, save-as-preset).
 *
 * A pushed page REPLACES the root panel's subtree — the stack renders it, not
 * the component that pushed it — so a provider mounted around the root page does
 * not wrap it. Inside a filter scope that would silently point the sub-page's
 * `useFilterEditor()` back at the VIEW's filter: a nested group opened from the
 * fold editor would edit the view filter instead. So every push re-enters the
 * current scope around the page.
 *
 * What it captures is the scope COMPONENT, never its value: the component
 * re-derives the controller from hooks when the page renders, so the page still
 * reads the tree as it is now — the stale-closure rule the whole filter panel
 * lives by (see `useFilterEditor`).
 */
export function useFilterPanelStack(): PanelStackApi {
  const stack = usePanelStack();
  const Scope = useContext(FilterScopeContext);
  return useMemo<PanelStackApi>(
    () =>
      Scope
        ? {
            ...stack,
            push: (entry) =>
              stack.push({
                ...entry,
                render: () => <Scope>{entry.render()}</Scope>,
              }),
          }
        : stack,
    [stack, Scope],
  );
}
