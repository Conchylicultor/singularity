import { useCallback, useMemo, type ReactNode } from "react";
import {
  pickPrimaryField,
  useResolveCell,
  type DataViewRenderProps,
  type FieldDef,
  type HierarchyConfig,
  type ItemActionsDescriptor,
} from "@plugins/primitives/plugins/data-view/web";
import type { TreeNode } from "@plugins/primitives/plugins/tree/core";
import {
  RenameInput,
  RowChrome,
  TreeList,
  type RowChromeMenuHelpers,
  type RowMenuItem,
} from "@plugins/primitives/plugins/tree/web";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import type { TreeViewOptions } from "../internal/types";

/**
 * The projected tree row: the original `TRow` plus the `TreeItem` fields the
 * tree primitive needs (`id`, `parentId`, `rank`, `expanded`). We keep the
 * original row reachable via `__row` so callbacks recover the concrete `TRow`.
 */
type Projected<TRow> = {
  id: string;
  parentId: string | null;
  rank: Rank;
  expanded: boolean;
  __row: TRow;
};

/**
 * Default row: render the primary field through the same `data-view.cell`
 * resolution the table uses, swapping in a `RenameInput` when the data source
 * supports inline rename and the primary field is text.
 */
function DefaultRow<TRow>(props: {
  node: TreeNode<Projected<TRow>>;
  depth: number;
  primaryField: FieldDef<TRow> | undefined;
  hierarchy: HierarchyConfig<TRow>;
  options: TreeViewOptions<TRow>;
  itemActions: ItemActionsDescriptor<TRow> | undefined;
}): ReactNode {
  const { node, depth, primaryField, hierarchy, options, itemActions } = props;
  const resolveCell = useResolveCell();
  const row = node.__row;

  const primaryValue = primaryField?.value?.(row);
  const primaryString = String(primaryValue ?? "");
  const labelClass = options.labelClassName?.(row);

  let label: ReactNode;
  if (
    hierarchy.onRename &&
    primaryField &&
    (primaryField.type ?? "text") === "text"
  ) {
    label = (
      <RenameInput
        nodeId={node.id}
        value={primaryString}
        onCommit={(next) => hierarchy.onRename!(node.id, next)}
        className={labelClass}
      />
    );
  } else if (primaryField) {
    label = (
      <span className={cn("min-w-0 flex-1 truncate", labelClass)}>
        {resolveCell(
          primaryField as FieldDef<unknown>,
          primaryValue ?? null,
          row,
        ) ?? primaryString}
      </span>
    );
  } else {
    label = (
      <span className={cn("min-w-0 flex-1 truncate", labelClass)}>
        {node.id}
      </span>
    );
  }

  const menu: ((helpers: RowChromeMenuHelpers) => RowMenuItem[]) | undefined =
    options.rowMenu
      ? (helpers) => options.rowMenu!(helpers, row)
      : undefined;

  const leadingIcon = options.leadingIcon?.(row);

  return (
    <RowChrome
      node={node}
      depth={depth}
      actions={
        itemActions ? (
          <itemActions.Row row={row} hasChildren={node.children.length > 0} />
        ) : undefined
      }
      menu={menu}
      // Merge the icon into the chevron slot (Notion style: icon at rest,
      // chevron on hover) rather than a separate leading column.
      icon={leadingIcon ?? undefined}
    >
      {label}
    </RowChrome>
  );
}

/**
 * Tree view: a thin adapter that projects the data-view rows + `HierarchyConfig`
 * onto the `tree` primitive's `TreeList`. No reimplementation — `buildTree`,
 * `filterTree` search, DnD `computeDrop`, and `RowChrome`/`RenameInput` all come
 * from the tree primitive.
 *
 * `rows`/`fields`/`options`/`hierarchy` arrive type-erased as `unknown`; this is
 * the documented re-cast boundary for the view child.
 */
export function TreeView(props: DataViewRenderProps<unknown>): ReactNode {
  // --- Documented cast boundary ---
  const hierarchy = props.hierarchy as HierarchyConfig<unknown> | undefined;
  const fields = props.fields as FieldDef<unknown>[];
  const itemActions = props.itemActions as
    | ItemActionsDescriptor<unknown>
    | undefined;
  // Memoized: `?? {}` would mint a fresh object every render and churn the
  // hooks below that depend on `options`.
  const options = useMemo(
    () => (props.options ?? {}) as TreeViewOptions<unknown>,
    [props.options],
  );

  const { rows, rowKey, expanded, setExpanded } = props;

  const primaryField = useMemo(() => pickPrimaryField(fields), [fields]);

  // Project each raw row → a TreeItem-shaped row, keeping a map back to the
  // original so TreeList callbacks recover the concrete `TRow`.
  const { projected, originalById } = useMemo(() => {
    const byId = new Map<string, unknown>();
    const out: Projected<unknown>[] = [];
    if (!hierarchy) return { projected: out, originalById: byId };
    rows.forEach((row, i) => {
      const id = rowKey(row, i);
      byId.set(id, row);
      out.push({
        id,
        parentId: hierarchy.getParentId(row),
        rank: hierarchy.getRank(row),
        expanded: hierarchy.isExpanded?.(row) ?? expanded?.[id] ?? false,
        __row: row,
      });
    });
    return { projected: out, originalById: byId };
  }, [rows, rowKey, hierarchy, expanded]);

  const Row = useCallback(
    (rowProps: { node: TreeNode<Projected<unknown>>; depth: number }) => {
      if (!hierarchy) return null;
      if (options.renderRow) return options.renderRow(rowProps.node);
      return (
        <DefaultRow
          node={rowProps.node}
          depth={rowProps.depth}
          primaryField={primaryField}
          hierarchy={hierarchy}
          options={options}
          itemActions={itemActions}
        />
      );
    },
    [hierarchy, options, primaryField, itemActions],
  );

  const primaryAccessor = useCallback(
    (row: Projected<unknown>) =>
      String(primaryField?.value?.(row.__row) ?? ""),
    [primaryField],
  );

  const dragOverlay = useMemo(() => {
    if (options.dragOverlay) {
      return (row: Projected<unknown>) => options.dragOverlay!(row.__row);
    }
    return (row: Projected<unknown>) => primaryAccessor(row);
  }, [options, primaryAccessor]);

  if (!hierarchy) return null;
  if (projected.length === 0) return <>{props.emptyState}</>;

  // Expand fallback: when the data source has no server-persisted expand state,
  // persist it in this view's ViewState (localStorage) via the host.
  const onToggleExpanded =
    hierarchy.onToggleExpanded ??
    ((id: string, next: boolean) => setExpanded?.(id, next));
  // TreeList requires `onMove`/`onCreate`; when the data source is read-only we
  // pass inert handlers (drag is naturally inert with a no-op move).
  const onMove = hierarchy.onMove ?? (() => {});
  const onCreate =
    hierarchy.onCreate ?? (async () => undefined as string | undefined);
  const addLabel = options.addLabel ?? (hierarchy.onCreate ? "Add" : null);

  return (
    <div className="px-sm">
      <TreeList<Projected<unknown>>
        rows={projected}
        selectedId={props.selectedRowId}
        rootId={options.rootId}
        onSelect={(id) => {
          const original = originalById.get(id);
          if (original !== undefined) props.onRowActivate?.(original);
        }}
        onToggleExpanded={onToggleExpanded}
        onMove={onMove}
        onCreate={onCreate}
        Row={Row}
        dragOverlay={dragOverlay}
        addLabel={addLabel}
        multiSelect={
          props.selection ? { actions: props.selection.bulkActions } : undefined
        }
        toolbar={{
          search: {
            accessor: primaryAccessor,
            query: props.state.query,
            hideInput: true,
          },
          expandAll: options.expandAll,
          hideTerminal: options.hideTerminal && {
            isTerminal: (r) => options.hideTerminal!.isTerminal(r.__row),
          },
          start: options.toolbarStart,
        }}
      />
    </div>
  );
}
