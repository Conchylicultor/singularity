import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import type { ScrollTruncation } from "@plugins/network/plugins/live/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import {
  isHostedToolbar,
  isSectionsToolbar,
  scopeFilterRows,
  type DataViewRenderProps,
  type FieldDef,
  type FieldExtensionsDescriptor,
  type FilterGroup,
  type LiveDataSource,
  type ManualOrderConfig,
  type DataViewFoldLines,
  type SortRule,
} from "../../core";
import type { ResolvedViewInstance } from "@plugins/primitives/plugins/data-view/plugins/view-core/web";
import { DataViewSlots, type DataViewContribution } from "../slots";
import { InfiniteScrollFooter } from "@plugins/primitives/plugins/cursor-pagination/web";
import { resolveBodyState } from "../internal/body-state";
import { BodyFallback } from "./body-fallback";
import {
  useFilterController,
  type FilterController,
} from "../internal/use-filter-controller";
import {
  useSortController,
  type SortController,
} from "../internal/use-sort-controller";
import { useGroupingRegistry } from "../grouping-slot";
import {
  useLiveSource,
  type LiveSegmentNotice,
  type SourceView,
} from "../internal/live-source";
import {
  checkFieldColumns,
  liveColumnScopeOf,
  resolveLiveFields,
} from "../internal/live-fields";
import { pickPrimaryField } from "../internal/pick-primary-field";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useResolveOperatorSet } from "../filter-slot";
import { useGroupingClock } from "../internal/use-grouping-clock";
import { useRowFilter } from "../internal/use-row-filter";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { PendingMoveOverlay } from "../internal/use-pending-move-overlay";
import { CollectFieldExtensions } from "../internal/field-extensions";
import { CollectFacetOptions } from "../internal/facet-options";
import { CollectRowOrder } from "../internal/row-order";
import {
  effectiveFold,
  isTailFolded,
  makeFoldKeep,
} from "../internal/fold-sections";
import { summarizeFilter } from "../internal/summarize-filter";
import type {
  DataViewBodyProps,
  DistributiveOmit,
} from "../internal/body-types";
import { DataViewToolbar } from "./toolbar/data-view-toolbar";
import { HostedOptions } from "./toolbar/hosted-options";
import { hostedCreators } from "./creators-control";
import { ViewSection } from "./view-section";
import type { Activation } from "@plugins/primitives/plugins/link-gesture/core";
import {
  DataViewControlsProvider,
  type DataViewControlsContextValue,
} from "./controls/controls-context";

/**
 * What a live list that stopped short tells the user (`InfiniteScrollFooter`'s
 * `hint`) — in their terms, per reason; the scroll's own wording goes to its log.
 */
const TRUNCATION_HINT: Readonly<Record<ScrollTruncation, string>> = {
  "segment-cap": "narrow the filter to see the rest",
  "long-sort-key":
    "the rest cannot be scrolled to in this sort — narrow the filter, or sort by another field",
};

/**
 * The per-active-instance body: everything downstream of "which instance is
 * active". The shell mounts exactly one body inside its root; the body never
 * mounts when the surface has zero instances (the shell's placeholder branch
 * early-returns first).
 */
export function DataViewBody<TRow>(props: DataViewBodyProps<TRow>): ReactNode {
  return (
    <CollectBodyFields source={props}>
      {(fields, rowKeyOf) => (
        <DataViewBodyInner
          {...props}
          fields={fields as FieldDef<TRow>[]}
          rowKeyOf={rowKeyOf}
        />
      )}
    </CollectBodyFields>
  );
}

/**
 * The `{ kind: "sections" }` body: EVERY instance, stacked in config order,
 * each a full `DataViewBodyInner` (its own controllers, live source, row
 * order and view) rendered under its own section header. The inner body is
 * already keyed by view id through the id-parameterised `ReadyViewModel`, so a
 * section is simply the body with that instance as its "active" one — and the
 * model stays ONE hook in the shell (per-section models would each hold their
 * own copy of the ephemeral map and overwrite each other's writes).
 *
 * The field-extension fold is hoisted ABOVE the sections, so contributed
 * fields (custom columns) subscribe once per surface, not once per section.
 */
export function DataViewSectionsBody<TRow>(
  props: DistributiveOmit<DataViewBodyProps<TRow>, "activeInstance"> & {
    instances: readonly ResolvedViewInstance<DataViewContribution>[];
  },
): ReactNode {
  const { instances } = props;
  return (
    <CollectBodyFields source={props}>
      {(fields, rowKeyOf) =>
        instances.map((instance) => (
          <DataViewBodyInner
            key={instance.instance.id}
            {...props}
            activeInstance={instance}
            fields={fields as FieldDef<TRow>[]}
            rowKeyOf={rowKeyOf}
          />
        ))
      }
    </CollectBodyFields>
  );
}

/**
 * Fold cross-plugin field contributions into `fields` BEFORE the controllers,
 * so the merged schema reaches `useSortController`, `useFilterController`, and
 * `renderProps.fields` uniformly (automatic once it is the `fields` prop). ONE
 * fold over an ordered list of sources:
 *
 *  1. the **global** `DataViewSlots.FieldExtension` slot — always folded (every
 *     DataView), the cross-cutting contributor case (e.g. custom-columns); then
 *  2. the **per-consumer** `props.fieldExtensions` factory (Sonata's play-count
 *     / last-played fields) — appended only when present.
 *
 * Both are the same `FieldExtensionsDescriptor`; the fold threads
 * `{ storageKey, rowKey }` to every contributor (a per-consumer contributor
 * ignores the coordinates it does not need). The host names no individual
 * contributor: custom-columns folds in through the generic global slot,
 * inverting the old host→child bridge.
 *
 * The fold runs in `unknown` row space (the global slot spans disjoint consumer
 * row types), so `props.fields`/`rowKey` and the merged result cross a safe
 * `FieldDef<unknown>`↔`FieldDef<TRow>` boundary cast.
 *
 * It also resolves the origin's row key (a live source keys rows by its
 * collection's id), checks every field against a live source, and hands each
 * field over one of the source's facets its read option state
 * (`CollectFacetOptions`).
 */
function CollectBodyFields<TRow>(props: {
  source: Pick<
    DataViewBodyProps<TRow>,
    "fields" | "fieldExtensions" | "storageKey" | "rowKey" | "source"
  >;
  children: (
    fields: FieldDef<unknown>[],
    rowKeyOf: (row: TRow, index: number) => string,
  ) => ReactNode;
}): ReactNode {
  const { source, children } = props;
  const live = source.source;
  const resolveOperatorSet = useResolveOperatorSet();
  // A collection taking scoped columns (custom columns) names the ONE surface
  // it is listed on — asserted here, at mount.
  const liveColumnScope = liveColumnScopeOf(live, source.storageKey);
  // A live source keys rows by its collection's id — the id the runtime keys
  // its deltas by, so the two cannot disagree.
  const rowKey = useMemo(
    () =>
      live !== undefined
        ? liveRowKey(live)
        : (source.rowKey as (row: TRow, index: number) => string),
    [live, source.rowKey],
  );
  // Fields are checked where they are declared: the host's own here, each
  // field-extension contributor's inside its own `render(fields)` (its error
  // boundary contains the crash and names it).
  checkFieldColumns(
    source.fields as FieldDef<unknown>[],
    live as LiveDataSource<unknown> | undefined,
    resolveOperatorSet,
    "the host's fields",
  );
  const validate = useCallback(
    (fields: FieldDef<unknown>[], contributor: string) =>
      checkFieldColumns(
        fields,
        live as LiveDataSource<unknown> | undefined,
        resolveOperatorSet,
        `field extension "${contributor}"`,
      ),
    [live, resolveOperatorSet],
  );
  return (
    <CollectFieldExtensions
      sources={
        source.fieldExtensions
          ? [
              DataViewSlots.FieldExtension,
              source.fieldExtensions as FieldExtensionsDescriptor<unknown>,
            ]
          : [DataViewSlots.FieldExtension]
      }
      base={source.fields as FieldDef<unknown>[]}
      storageKey={source.storageKey}
      rowKey={rowKey as (row: unknown, index: number) => string}
      liveColumnScope={liveColumnScope}
      validate={validate}
    >
      {(folded) => (
        <CollectFacetOptions
          source={live as LiveDataSource<unknown> | undefined}
          fields={folded}
          resolveOperatorSet={resolveOperatorSet}
        >
          {(fields) => children(fields, rowKey)}
        </CollectFacetOptions>
      )}
    </CollectFieldExtensions>
  );
}

/** A live source's row key: its collection's `id` field. */
function liveRowKey<TRow>(
  source: LiveDataSource<TRow>,
): (row: TRow, index: number) => string {
  const id = source.collection.id as string;
  return (row) => String((row as Record<string, unknown>)[id]);
}

/** All body hooks, unconditional — the only gate is the shell's placeholder
 *  early-return, which unmounts the whole body (a separate component). */
function DataViewBodyInner<TRow>(
  props: DataViewBodyProps<TRow> & {
    /** The row key the origin implies (`rowKey`, or a live collection's id). */
    rowKeyOf: (row: TRow, index: number) => string;
  },
): ReactNode {
  const {
    rows,
    rowKeyOf: rowKey,
    searchAccessor,
    rowTone,
    onRowActivate,
    rowActivation,
    onRowOpen,
    search,
    selectedRowId,
    emptyState,
    loadingState,
    readiness,
    errorState,
    hierarchy,
    viewOptions,
    manualOrder,
    aggregate,
    selection,
    itemActions,
    creators,
    storageKey,
    viewModel,
    activeInstance,
    chrome,
  } = props;

  // The schema is already fully merged: `props.fields` here arrives AFTER
  // `DataViewBody` folded both the global `DataViewSlots.FieldExtension` slot
  // (custom columns, keyed by `{ storageKey, rowKey }`) and the per-consumer
  // `fieldExtensions` factory into it. So the merged fields reach the
  // controllers and render-props uniformly with no custom-columns knowledge here.
  const fields = props.fields;

  // Derive the `hasChildren` predicate once from `hierarchy.getParentId` over
  // `rows` (absent hierarchy → always `false`). Flat views (table/gallery) use
  // it for a correct per-row `hasChildren`; the tree uses its own node count.
  const hasChildren = useMemo(() => {
    const parents = new Set<string>();
    if (hierarchy && rows) {
      for (const row of rows) {
        const pid = hierarchy.getParentId(row);
        if (pid != null) parents.add(pid);
      }
    }
    return (rowId: string) => parents.has(rowId);
  }, [rows, hierarchy]);

  const activeViewId = activeInstance.instance.id;
  // Re-merge the bundle's code-supplied `viewOptions[type]` UNDER the instance
  // options. Idempotent on the single-source path (the model already merged
  // them into `instance.options`); on the merged path the model built its
  // entries from static metadata only, so this is where code-only options
  // (`renderRow`, `renderBody`, …) reach the view. Memoized so the `options`
  // identity stays stable across renders (as `instance.options` was).
  const mergedOptions = useMemo(
    () => ({
      ...((viewOptions?.[activeInstance.instance.type] as object | undefined) ??
        {}),
      ...((activeInstance.instance.options as object | undefined) ?? {}),
    }),
    [viewOptions, activeInstance],
  );
  // ONE per-row activation resolver, so no view ever sees the two host props and
  // no view can re-invent the "is this row clickable" question. `onRowActivate`
  // is the every-row case folded into the same shape; `rowActivation` is the
  // per-row one. Passing both is a bug, not a precedence question — two props
  // asserting whether a row activates can disagree — so it throws rather than
  // picking a winner.
  const resolveRowActivation = useMemo<
    ((row: TRow) => Activation | undefined) | undefined
  >(() => {
    if (rowActivation && onRowActivate) {
      throw new Error(
        "DataView: pass `onRowActivate` (every row activates) or `rowActivation` " +
          "(per row), never both — they are two answers to one question.",
      );
    }
    if (rowActivation) return rowActivation;
    if (onRowActivate) return (row) => () => onRowActivate(row);
    return undefined;
  }, [rowActivation, onRowActivate]);

  // Computed here (not in the shell): `stateFor` mints a fresh object per call,
  // so the body reads it off the model itself and stays live on state writes.
  // A controlled `search` replaces this tab's stored query: the surface's own
  // field owns it, and every part that shows or applies a query reads this one.
  const storedState = viewModel.stateFor(activeViewId);
  const activeState =
    search === undefined
      ? storedState
      : { ...storedState, query: search.query };

  // The fold in effect: suspended while a search is typed (a match must never
  // hide behind "…"). Computed from `activeState` BEFORE the live branch below
  // zeroes `query`, and carried through that branch like `visibleFields`.
  // A view that draws no fold lines (the tree) gets no fold at all — applying
  // one would hold its live paging for rows it never set aside.
  const activeSupportsFold = activeInstance.viewType.supportsFold !== false;
  const fold = activeSupportsFold ? effectiveFold(activeState) : undefined;
  // Which sections' fold lines are open. Ephemeral on purpose — in memory, keyed
  // by the view it was opened in, so switching views or reloading re-closes
  // every fold (a fold is a standing narrowing; an open one is a glance).
  const [openFoldState, setOpenFoldState] = useState<{
    viewId: string;
    keys: ReadonlySet<string>;
  }>({ viewId: activeViewId, keys: NO_OPEN_FOLDS });
  const openFolds =
    openFoldState.viewId === activeViewId ? openFoldState.keys : NO_OPEN_FOLDS;
  const setFoldOpen = useCallback(
    (sectionKey: string, open: boolean) =>
      setOpenFoldState((prev) => {
        const next = new Set(
          prev.viewId === activeViewId ? prev.keys : NO_OPEN_FOLDS,
        );
        if (open) next.add(sectionKey);
        else next.delete(sectionKey);
        return { viewId: activeViewId, keys: next };
      }),
    [activeViewId],
  );

  // The operator-set resolver, read here (not off the filter controller below)
  // because the live source's paging hold needs it before that exists.
  const resolveOperatorSet = useResolveOperatorSet();
  // The fold rule's `keep` tree as a row predicate (null ⇒ keeps every row).
  const matchesFoldKeep = useRowFilter(
    fold?.keep ?? null,
    fields,
    resolveOperatorSet,
  );

  // A live source: its fields resolved against the collection (what the Sort
  // and Filter controls offer, and each field's column).
  const liveSource = props.source;
  const livePlan = useMemo(
    () =>
      liveSource
        ? resolveLiveFields(fields, liveSource, resolveOperatorSet, "fields")
        : null,
    [liveSource, fields, resolveOperatorSet],
  );

  // While the fold is closed everywhere and the LAST loaded row is folded,
  // stop auto-fetching: the next page would only land behind "…". Opening any
  // fold lifts the hold (and brings the sentinel back).
  const holdPaging = (loaded: readonly TRow[]) =>
    isTailFolded(loaded, {
      fold,
      openCount: openFolds.size,
      isKept: fold
        ? makeFoldKeep(matchesFoldKeep, {
            selectedRowId,
            rowKey: (row) => rowKey(row, 0),
          })
        : () => true,
      rowKey,
    });
  // Optional live source (always called; `null` without one). When present,
  // filter/sort/search/paginate run server-side over the live `activeState`,
  // so its segments replace `rows` and the client pipeline (`useFlatRows`) is
  // neutralized into a pass-through below.
  const groupingRegistry = useGroupingRegistry();
  const live = useLiveSource({
    source: liveSource,
    plan: livePlan,
    fields,
    state: activeState,
    resolveOperatorSet,
    resolveGrouping: groupingRegistry.resolve,
    holdPaging,
  });
  // The server-ordered origin in effect, as the body renders it.
  const origin: SourceView<TRow> | null = live;

  // Filter controller — the popover builder consumes the full surface (filter,
  // setFilter, filterableFields, resolveOperatorSet, ruleCount).
  const setActiveFilter = useCallback(
    (filter: FilterGroup | null) => viewModel.setFilter(activeViewId, filter),
    [viewModel, activeViewId],
  );
  const filterController = useFilterController(
    livePlan?.filterFields ?? fields,
    activeState.filter,
    setActiveFilter,
  );

  // Sort controller — the popover builder consumes the flat surface (rules,
  // sortableFields, ruleCount, add/remove/setDirection/setField/move/clear).
  const setActiveSortRules = useCallback(
    (rules: SortRule[]) => viewModel.setSortRules(activeViewId, rules),
    [viewModel, activeViewId],
  );
  const sortController = useSortController(
    livePlan?.sortFields ?? fields,
    activeState.sort,
    setActiveSortRules,
  );
  // The fields a column header may sort by: exactly the Sort control's.
  const sortableIds = useMemo(
    () => new Set(sortController.sortableFields.map((f) => f.id)),
    [sortController.sortableFields],
  );
  // Saved sort/filter presets are NOT read here. They are config a user only
  // ever looks at with a panel open, and each panel is a mounted component that
  // can hook freely — so `useSortPresets` / `useFilterPresets` live in the sort
  // and filter panels. Reading them here made every DataView on the page
  // subscribe to its presets config just to draw a closed icon.

  // A view opts out of the Sort pill via `supportsSort: false`. Every current
  // view honors sort (the tree sorts each sibling group by field, defaulting to
  // manual/rank order), so this stays enabled; the flag remains for future
  // sort-less view types. Default (undefined) = honors sort.
  const activeSupportsSort = activeInstance.viewType.supportsSort !== false;
  // Whether the active view can render a flat rank-ordered, drag-reorderable
  // body at all (list/table opt in; gallery/tree do not). It says nothing about
  // whether an order is *available* — see `manualOrderActive` below.
  const activeSupportsManualOrder =
    !!activeInstance.viewType.supportsManualOrder;
  // Whether the sort control applies at all is the SORT CONTROL's own
  // `isApplicable` now (`activeSupportsSort && sortableFields.length > 0`, both
  // published on the controls context) — the host no longer decides which
  // controls exist. Manual order does not suppress it: a sort simply overrides
  // the manual order (Notion's model), so the control must stay reachable to
  // clear it.

  // Group-by support mirrors sort: every built-in view (including the tree,
  // which partitions its ROOTS into sections) supports it today; the opt-out
  // flag remains for future group-less view types. The settings menu hides the
  // group-by control accordingly.
  const activeSupportsGroupBy =
    activeInstance.viewType.supportsGroupBy !== false;

  // The grouping clock, read ONCE per surface: one quantized `now` (local
  // midnight) shared by every view child, re-armed at the day boundary. Reading
  // it per view would give two views of the same surface two different memo keys
  // for the same day.
  const now = useGroupingClock();
  // Which end of a bucket's ordinal the sections read from: the direction of the
  // view's own sort ON THE GROUPED FIELD, so "Upcoming" (startsAt asc) reads
  // Today → Tomorrow → Later, and "All" (startsAt desc) reads newest first, with
  // no second config axis.
  //
  // It reads `activeState.sort` and NOT `effectiveState.sort`, which a
  // live source zeroes out (the SQL already sorted) — the views can
  // therefore no longer see the direction themselves, which is exactly why this
  // is computed here and threaded down.
  const groupOrder: "asc" | "desc" =
    activeState.sort.find((r) => r.fieldId === activeState.groupBy?.fieldId)
      ?.direction ?? "asc";
  // The `Grouping` registry read, likewise once per surface: the toolbar's
  // group-by control asks "which fields can group?" through it (the settings
  // contribution's `isApplicable` is a pure function and cannot read a slot).
  const hasGrouping = groupingRegistry.has;

  // Whether a row-order contributor may own this view's order. Each clause is a
  // structural exclusion, not a preference:
  const rowOrderEnabled =
    activeSupportsManualOrder && // list / table only
    manualOrder == null && // a consumer's domain order wins
    props.source == null && // a live source is server-sorted ⇒ the client cannot own the order
    aggregate == null; // an aggregate representative's rank cannot stand for its members
  // Group-by is deliberately NOT a clause. Reordering WITHIN a section is
  // well-defined (the contributed order covers the whole unpartitioned set, so a
  // drop anchored on a same-section neighbour resolves globally), and a drop into
  // ANOTHER section — which would need the group field written — is refused by
  // the view unless the config supplies `ManualOrderConfig.onReseat`. Suspending
  // the whole order because one kind of drop is unsupported is what made
  // reordering silently stop working under a group-by.

  // The per-view Properties control (which fields render in the body + their
  // order) now lives in the settings gear as a `view`-scope `DataViewSlots.Setting`
  // contribution (see `PropertiesControl`), reading/writing the same
  // `activeState.visibleFields` / `viewModel.setVisibleFields` via
  // `DataViewSettingsContext` — no host wiring needed here.

  // Live substitution: when a `source` drives this DataView, the SQL already
  // applied sort/filter/search, so feed the loaded segments' rows and neutralize the client pipeline (`useFlatRows` collapses to a pass-through
  // when sort/filter/query are empty). Absent → the in-memory path is untouched.
  const effectiveRows: readonly unknown[] = origin
    ? origin.rows
    : ((rows ?? NO_ROWS) as readonly unknown[]);
  // Neutralize ONLY the server-owned dimensions (sort/filter/query already ran in
  // SQL). `visibleFields` is display-only — it never touches the query — so the
  // `...activeState` spread deliberately PRESERVES it so the views still honor
  // Properties on the live path.
  const effectiveState = origin
    ? { ...activeState, sort: [], filter: null, query: "", fold }
    : { ...activeState, fold };
  // What renders in place of the view, if anything: server error > failed
  // read > loading > the view (see `resolveBodyState`).
  const bodyState = resolveBodyState({ server: origin, readiness });

  // A sections surface renders this view as one section, and a section whose
  // config row says `hideWhenEmpty` is decided HERE, before the view mounts:
  // hidden while the rows are not known yet (a loading section would otherwise
  // paint "empty" for an unknown — or flash in and vanish), hidden once they
  // are known and none survive the view's filter, shown otherwise (a failed
  // read included, so its error is not swallowed). The same predicate the views
  // apply — `useRowFilter` over the same fields — under the same scope
  // (`scopeFilterRows`, the tree's own function), so a section can never be
  // shown empty or hidden while its view would render rows.
  const sectioned = isSectionsToolbar(chrome.toolbar);
  const presentation = viewModel.sectionFor(activeViewId);
  const decideEmptiness = sectioned && presentation.hideWhenEmpty;
  const emptinessFilter = useRowFilter(
    decideEmptiness && !origin ? activeState.filter : null,
    fields,
    resolveOperatorSet,
  );
  const rootsScoped =
    activeState.filterScope === "roots" &&
    hierarchy != null &&
    activeInstance.viewType.hierarchical === true;
  const hasNoRows = useMemo(() => {
    if (!decideEmptiness) return false;
    // A live origin already filtered in SQL.
    if (origin) return origin.rows.length === 0;
    const matches = emptinessFilter ?? (() => true);
    if (!rows) return true;
    if (!rootsScoped || !hierarchy) return !rows.some((row) => matches(row));
    const items = rows.map((row, i) => ({ row, key: rowKey(row, i) }));
    return (
      scopeFilterRows(items, "roots", {
        key: (item) => item.key,
        parentOf: (item) => hierarchy.getParentId(item.row),
        matches: (item) => matches(item.row),
      }).length === 0
    );
  }, [
    decideEmptiness,
    origin,
    emptinessFilter,
    rootsScoped,
    rows,
    rowKey,
    hierarchy,
  ]);
  const sectionHidden =
    decideEmptiness &&
    (bodyState.kind === "loading" || (bodyState.kind === "view" && hasNoRows));

  // The fold line's controls, handed to every view — present exactly when a fold
  // is in effect, so a view never draws a line for a rule that is suspended.
  const foldSummary = fold
    ? summarizeFilter(
        fold.keep,
        fields as FieldDef<unknown>[],
        resolveOperatorSet,
      )
    : null;
  const foldLines: DataViewFoldLines | undefined = fold
    ? {
        open: openFolds,
        setOpen: setFoldOpen,
        // The same words the filter control's tooltip uses for a filter tree:
        // "Folding all but: Updated is within past 30 days +1".
        summary: foldSummary
          ? `Folding all but: ${foldSummary.label}${foldSummary.more ? ` +${foldSummary.more}` : ""}`
          : undefined,
      }
    : undefined;

  if (sectionHidden) return null;

  // Fold the global `RowOrder` slot around the whole render. The children-callback
  // is a plain function call (invoked in the fold's base case), NOT a component —
  // so it contains no hooks; every hook above stays in this component's body.
  //
  // The fold takes the RAW rows and derives the ordered set itself, but only when
  // `enabled` — deriving it here would cost EVERY DataView (tree, gallery,
  // server-paginated) an extra `useFlatRows` pass per render for a set it discards.
  return (
    <CollectRowOrder
      enabled={rowOrderEnabled}
      storageKey={storageKey}
      viewId={activeViewId}
      rowKey={rowKey as (row: unknown, index: number) => string}
      rows={effectiveRows}
      fields={fields as FieldDef<unknown>[]}
      state={activeState}
      resolveOperatorSet={filterController.resolveOperatorSet}
      searchAccessor={searchAccessor as ((row: unknown) => string) | undefined}
    >
      {(contributedRowOrder) => {
        // One rule everywhere — the render path never branches on where the order
        // came from. The consumer's domain order outranks any contributor.
        const cfg =
          (manualOrder as ManualOrderConfig<unknown> | undefined) ??
          contributedRowOrder ??
          null;
        // A field sort OVERRIDES the manual order and suspends drag; clearing it
        // restores the order. The sort test lives here and NOT in `rowOrderEnabled`
        // on purpose: toggling a sort off/on must not tear down the contributor's
        // live subscription, and `useDataViewSections`'s `manualRank ⇒ sort: []`
        // rule stays untouched — the host simply withholds the config while a sort
        // is set.
        const manualOrderActive =
          cfg != null &&
          activeSupportsManualOrder &&
          activeState.sort.length === 0;
        // The mirror image: an order EXISTS for this view but a sort is
        // shadowing it. After grouping stopped suspending drag, this is the last
        // silent cause of "dragging stopped working", so the sort popover says so.
        const manualOrderOverridden =
          cfg != null &&
          activeSupportsManualOrder &&
          activeState.sort.length > 0;

        // The host passes RAW rows; each view applies the processing matching its own
        // semantics (gallery/table call `useFlatRows`, the tree feeds `TreeList`).
        const renderProps: DataViewRenderProps<unknown> = {
          rows: effectiveRows,
          fields: fields as DataViewRenderProps<unknown>["fields"],
          rowKey: rowKey as DataViewRenderProps<unknown>["rowKey"],
          state: effectiveState,
          setSort: (fieldId) => {
            if (!sortableIds.has(fieldId)) {
              throw new Error(
                `DataView "${storageKey}": setSort("${fieldId}") names a field this list cannot sort by`,
              );
            }
            viewModel.setSort(activeViewId, fieldId);
          },
          sortHeader: { active: activeState.sort, sortable: sortableIds },
          setFilter: (filter) => viewModel.setFilter(activeViewId, filter),
          rowActivation:
            resolveRowActivation as DataViewRenderProps<unknown>["rowActivation"],
          onRowOpen: onRowOpen as DataViewRenderProps<unknown>["onRowOpen"],
          selectedRowId,
          options: mergedOptions,
          searchAccessor:
            searchAccessor as DataViewRenderProps<unknown>["searchAccessor"],
          rowTone: rowTone as DataViewRenderProps<unknown>["rowTone"],
          hierarchy: hierarchy as DataViewRenderProps<unknown>["hierarchy"],
          // `manualOrderActive` already implies `cfg != null` (TS cannot see it
          // through the boolean), hence the assertion.
          manualOrder: manualOrderActive
            ? (cfg as ManualOrderConfig<unknown>)
            : undefined,
          // Aggregate is a pure pipeline transform (orthogonal to the supports* flags):
          // hand it to every flat view; only those rendering via `useDataViewSections`
          // (list/table/gallery) act on it — the tree ignores it.
          aggregate: aggregate as DataViewRenderProps<unknown>["aggregate"],
          selection,
          expanded: activeState.expanded,
          setExpanded: (changes) =>
            viewModel.setExpanded(activeViewId, changes),
          now,
          groupOrder,
          // In memory the rows are the whole set; a server-ordered origin says
          // when it has read to the end.
          rowsComplete: origin ? origin.rowsComplete : true,
          sectionOrder: origin ? origin.sectionOrder : "bucket",
          collapsedSections: viewModel.collapsedSectionsFor(activeViewId),
          setSectionCollapsed: (key, collapsed) =>
            viewModel.setSectionCollapsed(activeViewId, key, collapsed),
          foldLines,
          emptyState,
          itemActions:
            itemActions as DataViewRenderProps<unknown>["itemActions"],
          hasChildren,
          creators,
          // The surface's own declaration, straight off the chrome (the ONE
          // place both hosts set it) — the view child decides what to tighten.
          density: chrome.density,
          groupHeaders: chrome.groupHeaders,
        };

        // The ONE context every toolbar control and settings contribution reads —
        // no prop-threading. Nothing here is derived: every field was computed
        // above (or, for `manualOrderOverridden`, a few lines up) and is merely
        // re-homed, so a control's summary and what actually filters/sorts come
        // from the very same controller objects the row pipeline uses.
        //
        // Provided around the TOOLBAR only (below), never around the view body:
        // view children have a deliberate contract (`DataViewRenderProps`), and an
        // ambient back door to `viewModel` would be a second undocumented seam.
        const controlsContext: DataViewControlsContextValue = {
          storageKey,
          fields: fields as DataViewRenderProps<unknown>["fields"],
          activeViewId,
          activeState,
          viewModel,
          activeSupportsGroupBy,
          activeSupportsFold,
          hasGrouping,
          activeSupportsSort,
          activeSupportsManualOrder,
          manualOrderOverridden,
          filter: filterController as FilterController<unknown>,
          sort: sortController as SortController<unknown>,
        };

        const onQueryChange =
          search?.onQueryChange ??
          ((next: string) => viewModel.setQuery(activeViewId, next));
        const body = (
          <>
            {/* One density for every view type, so a row's controls and decorations
                (avatars, status dots, chips, buttons) look identical whether the same
                data is shown as a table, tree, list, or gallery. The table view's
                `data-table` primitive already defaults to `xs`; declaring it here once
                brings tree/list/gallery in line instead of each falling through to the
                ambient `md` default. */}
            {/* The host owns the loading→empty precedence: while loading it renders the
                view-type's declared skeleton and NEVER calls `renderIsolated`, so a view
                child only ever renders in the confirmed-not-loading state (it can no
                longer mishandle loading and let a skeleton-less empty state leak through). */}
            {/* Keyed by the active instance id so switching view instances remounts
                the view child (and its loading skeleton): virtualizer measurement
                caches, inline editors, and local tree expand state are per-instance
                and must not leak between two instances of the same view type. */}
            <ControlSizeProvider key={activeViewId} size="xs">
              {bodyState.kind !== "view" ? (
                <BodyFallback
                  state={bodyState}
                  errorState={errorState}
                  loadingState={loadingState}
                  loadingVariant={activeInstance.viewType.loadingVariant}
                  loadingCount={activeInstance.viewType.loadingCount}
                />
              ) : (
                // Holds a dropped row at its new slot until the producer's
                // own order carries the move — no snap-back while the write
                // is in flight, for every producer (see the hook).
                <>
                  {/* A live segment that could not refresh keeps its rows on
                      screen; its notice sits above them, naming where. */}
                  {origin && origin.notices.length > 0 ? (
                    <SegmentNotices
                      notices={origin.notices}
                      rows={effectiveRows}
                      fields={fields as FieldDef<unknown>[]}
                      rowKey={rowKey as (row: unknown, index: number) => string}
                    />
                  ) : null}
                  <PendingMoveOverlay
                    config={renderProps.manualOrder}
                    rows={effectiveRows}
                    rowKey={renderProps.rowKey}
                  >
                    {(manualOrder) =>
                      renderIsolated(
                        DataViewSlots.View,
                        activeInstance.viewType as unknown as Contribution,
                        { ...renderProps, manualOrder },
                      )
                    }
                  </PendingMoveOverlay>
                </>
              )}
            </ControlSizeProvider>
            {/* Server-ordered infinite scroll: the error-gated footer (loading-more
                spinner, Retry on a failed page, the IntersectionObserver sentinel,
                and — for a live scroll at its cap — the line saying it stops).
                Rendered only on a server-ordered origin. */}
            {origin ? (
              <InfiniteScrollFooter
                handle={origin.scroll}
                truncated={
                  origin.truncated === false
                    ? false
                    : {
                        shown: effectiveRows.length,
                        hint: TRUNCATION_HINT[origin.truncated.reason],
                      }
                }
              />
            ) : null}
          </>
        );

        // Sections: this view is one section of the surface, under its own
        // header — no band, no frame. The header's `⋯` holds this view's
        // controls, so the controls provider wraps that panel alone, exactly as
        // it wraps a hosted frame's options trigger.
        if (isSectionsToolbar(chrome.toolbar)) {
          return (
            <ViewSection
              instance={activeInstance}
              presentation={presentation}
              setCollapsed={(collapsed) =>
                viewModel.setViewCollapsed(activeViewId, collapsed)
              }
              header={chrome.toolbar.forms?.header ?? "eyebrow"}
              creators={creators?.filter(
                (c) => c.views === undefined || c.views.includes(activeViewId),
              )}
              controls={controlsContext}
              query={activeState.query}
              onQueryChange={onQueryChange}
              searchPlaceholder={chrome.searchPlaceholder}
              actions={viewModel.actions}
            >
              {body}
            </ViewSection>
          );
        }

        // Hosted: no band. The surface's frame is its own header and places the
        // options trigger; the controls provider wraps that trigger alone, so the
        // view body still sees only its `DataViewRenderProps` contract.
        if (isHostedToolbar(chrome.toolbar)) {
          const Frame = chrome.toolbar.frame;
          return (
            <Frame
              options={
                <DataViewControlsProvider {...controlsContext}>
                  <HostedOptions
                    query={activeState.query}
                    onQueryChange={onQueryChange}
                    searchPlaceholder={chrome.searchPlaceholder}
                    revealOnHover={
                      (chrome.toolbar.forms?.options ?? "revealed") ===
                      "revealed"
                    }
                  />
                </DataViewControlsProvider>
              }
              switcher={chrome.switcherCount > 1 ? chrome.switcher.chip : null}
              creators={hostedCreators(creators)}
              body={body}
              stickyRef={chrome.stickyRef}
            />
          );
        }

        return (
          <>
            {/* The toolbar folds when the surface ASKS for it (`density`) or when
                it is genuinely too narrow for the wide inline row
                (`COMPACT_BREAKPOINT`) — the folded single-bar compact form
                (search + every control inside one `MdTune` options popover,
                single-view switcher hidden). The host hands it NO control — the
                toolbar reads `DataViewSlots.Control` itself and each control's
                panel reads this provider's context, so adding a control is a
                contribution and never an edit here. */}
            <DataViewControlsProvider {...controlsContext}>
              <DataViewToolbar
                stickyRef={chrome.stickyRef}
                title={chrome.title}
                query={activeState.query}
                onQueryChange={onQueryChange}
                switcher={chrome.switcher}
                switcherCount={chrome.switcherCount}
                actions={chrome.actions}
                creators={creators}
                density={chrome.density}
                arrangement={chrome.toolbar}
                searchPlaceholder={chrome.searchPlaceholder}
              />
            </DataViewControlsProvider>
            {body}
          </>
        );
      }}
    </CollectRowOrder>
  );
}

/**
 * A live segment's failed refresh, above the rows it could not refresh: named
 * by the last row before it (the head's, when there is none), with its own
 * Retry. One notice per failing segment, in the body — a notice BETWEEN two
 * rows would need a non-row entry kind in every view.
 */
function SegmentNotices(props: {
  notices: readonly LiveSegmentNotice[];
  rows: readonly unknown[];
  fields: FieldDef<unknown>[];
  rowKey: (row: unknown, index: number) => string;
}): ReactNode {
  const { notices, rows, fields, rowKey } = props;
  const primary = pickPrimaryField(fields);
  const labelOf = (id: string): string => {
    const row = rows.find((r, i) => rowKey(r, i) === id);
    const value = row === undefined ? undefined : primary?.value?.(row);
    return value === undefined || value === null || value === ""
      ? id
      : String(value);
  };
  return (
    <Stack gap="xs" className="rail-follow py-xs">
      {notices.map((n) => (
        <Placeholder key={n.key} tone="error">
          {n.afterRowId === null
            ? "The first rows could not refresh"
            : `Rows after “${labelOf(n.afterRowId)}” could not refresh`}
          {` — ${n.error.message} `}
          <Button variant="ghost" onClick={() => n.retry()}>
            Retry
          </Button>
        </Placeholder>
      ))}
    </Stack>
  );
}

const NO_ROWS: readonly unknown[] = [];

/** The shared "no fold open" set — one identity, so an idle view's `openFolds`
 *  never changes between renders. */
const NO_OPEN_FOLDS: ReadonlySet<string> = new Set();
