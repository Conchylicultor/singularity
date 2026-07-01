import { useCallback, useMemo, type ReactNode } from "react";
import {
  evaluateNode,
  makeSortComparator,
  pickPrimaryField,
  resolveBodyFields,
  useResolveCell,
  useResolveOperatorSet,
  type DataViewRenderProps,
  type FieldDef,
  type HierarchyConfig,
  type ItemActionsDescriptor,
} from "@plugins/primitives/plugins/data-view/web";
import type { TreeNode } from "@plugins/primitives/plugins/tree/core";
import {
  RowChrome,
  TreeList,
  type RowChromeMenuHelpers,
  type RowMenuItem,
} from "@plugins/primitives/plugins/tree/web";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import type { TreeViewOptions } from "../internal/types";
import { EditableTreeLabel } from "./editable-tree-label";

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
 * resolution the table uses, swapping in an `EditableTreeLabel` (select-then-edit
 * over the shared `useResolveCellEditor` capability) when the primary field
 * declares `onEdit`/`onEditValues`. The remaining visible (non-primary) fields
 * render as read-only trailing chips — the tree's body now follows the view's
 * Properties (visible-fields) policy like every other view, not label-only.
 */
function DefaultRow<TRow>(props: {
  node: TreeNode<Projected<TRow>>;
  depth: number;
  primaryField: FieldDef<TRow> | undefined;
  secondaryFields: FieldDef<TRow>[];
  options: TreeViewOptions<TRow>;
  itemActions: ItemActionsDescriptor<TRow> | undefined;
}): ReactNode {
  const { node, depth, primaryField, secondaryFields, options, itemActions } =
    props;
  const resolveCell = useResolveCell();
  const row = node.__row;

  const primaryValue = primaryField?.value?.(row);
  const primaryString = String(primaryValue ?? "");
  const labelClass = options.labelClassName?.(row);

  let label: ReactNode;
  if (primaryField && (primaryField.onEdit || primaryField.onEditValues)) {
    const readNode =
      resolveCell(
        primaryField as FieldDef<unknown>,
        primaryValue ?? null,
        row,
      ) ?? primaryString;
    label = (
      <EditableTreeLabel
        node={node}
        row={row}
        field={primaryField as FieldDef<unknown>}
        read={readNode}
        className={labelClass}
      />
    );
  } else if (primaryField) {
    label = (
      // eslint-disable-next-line layout/no-adhoc-layout -- flexible truncating label, a row-level flex child of TreeRowChrome's flex row (it owns the row layout)
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
      // eslint-disable-next-line layout/no-adhoc-layout -- flexible truncating label, a row-level flex child of TreeRowChrome's flex row (it owns the row layout)
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
  const trailing = options.trailing?.(row);
  const accent = options.rowAccent?.(row);

  return (
    <RowChrome
      node={node}
      depth={depth}
      accent={accent}
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
      {secondaryFields.length > 0 ? (
        // Read-only secondary-field chips (the tree's body fields, in Properties
        // order), sitting between the label and any persistent `options.trailing`.
        // Rigid (never shrink) so the truncating label absorbs the slack.
        // eslint-disable-next-line layout/no-adhoc-layout -- shrink-0 rigid trailing cluster beside the flexible label, the tree row owns its flex row
        <Inline gap="xs" className="shrink-0">
          {secondaryFields.map((f) => (
            <span key={f.id}>
              {resolveCell(
                f as FieldDef<unknown>,
                f.value?.(row) ?? null,
                row,
              ) ?? String(f.value?.(row) ?? "")}
            </span>
          ))}
        </Inline>
      ) : null}
      {trailing != null ? (
        <Center as="span" axis="both">
          {trailing}
        </Center>
      ) : null}
    </RowChrome>
  );
}

/**
 * Tree view: a thin adapter that projects the data-view rows + `HierarchyConfig`
 * onto the `tree` primitive's `TreeList`. No reimplementation — `buildTree`,
 * `filterTree` search, DnD `computeDrop`, and `RowChrome` all come from the tree
 * primitive; the primary label's inline edit reuses the shared cell-editor
 * capability via `EditableTreeLabel`.
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

  // Body fields follow the view's Properties (visible-fields) policy; sort/filter/
  // search keep using the full `fields`. `null` → identity (= `fields`), so the
  // label pick is unchanged and the secondary chips become every non-primary
  // field (the show-all default — the whole point of the fix for the tree).
  const vis = useMemo(
    () => resolveBodyFields(fields, props.state.visibleFields),
    [fields, props.state.visibleFields],
  );
  const primaryField = useMemo(() => pickPrimaryField(vis), [vis]);
  const secondaryFields = useMemo(
    () => vis.filter((f) => f.id !== primaryField?.id),
    [vis, primaryField],
  );
  const resolveOperatorSet = useResolveOperatorSet();

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

  // Apply the view's filter through the same `evaluateNode` evaluator the flat
  // views use, so filter semantics are identical across all views. Filtering is
  // *subtree-preserving* (mirrors the tree's search): a node survives if it
  // matches the filter or has a matching descendant — i.e. matches plus the
  // ancestor chain of every match — so filtered rows keep their hierarchical
  // context instead of being orphaned to the root.
  const visibleProjected = useMemo(() => {
    const filter = props.state.filter;
    if (!filter) return projected;
    const matched = new Set<string>();
    for (const p of projected) {
      if (evaluateNode(filter, p.__row, fields, resolveOperatorSet)) {
        matched.add(p.id);
      }
    }
    if (matched.size === projected.length) return projected;
    const parentById = new Map(projected.map((p) => [p.id, p.parentId]));
    const keep = new Set<string>(matched);
    for (const id of matched) {
      let cur = parentById.get(id) ?? null;
      while (cur && !keep.has(cur)) {
        keep.add(cur);
        cur = parentById.get(cur) ?? null;
      }
    }
    return projected.filter((p) => keep.has(p.id));
  }, [projected, props.state.filter, fields, resolveOperatorSet]);

  // Field sort (default: manual/rank order). Empty rules → `null` comparator →
  // the projected rows keep their incoming (rank) order, i.e. the manual sort the
  // tree ships by default and DnD reorders. When a rule resolves we reorder the
  // rows by the SAME multi-level comparator the flat views use. `buildTree`
  // preserves each parent's incoming child order, so a single stable *global*
  // sort of the flat row list lands every sibling group in comparator order
  // (stability keeps rank order as the final tie-break).
  const rowComparator = useMemo(
    () => makeSortComparator(props.state.sort, fields),
    [props.state.sort, fields],
  );
  const sortActive = rowComparator !== null;
  const sortedProjected = useMemo(() => {
    if (!rowComparator) return visibleProjected;
    return [...visibleProjected].sort((a, b) =>
      rowComparator(a.__row, b.__row),
    );
  }, [visibleProjected, rowComparator]);

  const Row = useCallback(
    (rowProps: { node: TreeNode<Projected<unknown>>; depth: number }) => {
      if (!hierarchy) return null;
      if (options.renderRow)
        return options.renderRow(rowProps.node, rowProps.depth);
      return (
        <DefaultRow
          node={rowProps.node}
          depth={rowProps.depth}
          primaryField={primaryField}
          secondaryFields={secondaryFields}
          options={options}
          itemActions={itemActions}
        />
      );
    },
    [hierarchy, options, primaryField, secondaryFields, itemActions],
  );

  const primaryAccessor = useCallback(
    (row: Projected<unknown>) =>
      String(primaryField?.value?.(row.__row) ?? ""),
    [primaryField],
  );

  // The host's `searchAccessor` (when provided) drives the tree's
  // subtree-preserving filter, so a consumer can match on more than the label
  // (e.g. ancestor names, secondary fields). Falls back to the primary label.
  const propsSearchAccessor = props.searchAccessor;
  const searchAccessor = useCallback(
    (row: Projected<unknown>) =>
      propsSearchAccessor
        ? propsSearchAccessor(row.__row)
        : primaryAccessor(row),
    [propsSearchAccessor, primaryAccessor],
  );

  const dragOverlay = useMemo(() => {
    if (options.dragOverlay) {
      return (row: Projected<unknown>) => options.dragOverlay!(row.__row);
    }
    return (row: Projected<unknown>) => primaryAccessor(row);
  }, [options, primaryAccessor]);

  if (!hierarchy) return null;
  if (sortedProjected.length === 0) return <>{props.emptyState}</>;

  // A field sort overrides the manual (rank) order, so drag-to-reorder would set
  // a rank with no visible effect — disable DnD while sorted (drop back to manual
  // to reorder), mirroring Notion. `onCreate` stays enabled.
  const onMove = sortActive ? undefined : hierarchy.onMove;

  // Expand fallback: when the data source has no server-persisted expand state,
  // persist it in this view's ViewState (localStorage) via the host.
  const onToggleExpanded =
    hierarchy.onToggleExpanded ??
    ((id: string, next: boolean) => setExpanded?.(id, next));
  // `onMove`/`onCreate` are optional: omitting them yields a read-only tree —
  // TreeList drops the drag source and every Add affordance (no inert handlers).
  // Respect an *explicit* `addLabel: null` (hide the root footer) — `??` would
  // swallow it and fall back to "Add". Only an absent (undefined) option falls
  // through to the onCreate-derived default.
  const addLabel =
    options.addLabel !== undefined
      ? options.addLabel
      : hierarchy.onCreate
        ? "Add"
        : null;

  return (
    <div className="px-sm">
      <TreeList<Projected<unknown>>
        rows={sortedProjected}
        selectedId={props.selectedRowId}
        rootId={options.rootId}
        onSelect={(id) => {
          const original = originalById.get(id);
          if (original !== undefined) props.onRowActivate?.(original);
        }}
        onToggleExpanded={onToggleExpanded}
        onMove={onMove}
        onCreate={hierarchy.onCreate}
        Row={Row}
        dragOverlay={dragOverlay}
        addLabel={addLabel}
        canCreate={!!hierarchy.onCreate}
        multiSelect={
          props.selection ? { actions: props.selection.bulkActions } : undefined
        }
        toolbar={{
          search: {
            accessor: searchAccessor,
            query: props.state.query,
            hideInput: true,
          },
          expandAll: options.expandAll,
          start: options.toolbarStart,
        }}
      />
    </div>
  );
}
