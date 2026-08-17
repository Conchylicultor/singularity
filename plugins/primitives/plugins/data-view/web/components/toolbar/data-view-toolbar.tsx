import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { type ReactNode, type Ref } from "react";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { useElementSize } from "@plugins/primitives/plugins/element-size/web";
import type { CreateOption } from "../../../core";
import { DataViewSlots } from "../../slots";
import { useDataViewControls } from "../controls/controls-context";
import { CompactControls } from "./compact-controls";
import { ControlTrigger } from "./control-trigger";
import { CreatorsControl } from "../creators-control";

/**
 * Below this container width the toolbar folds: search AND every control
 * collapse behind one `MdTune` options popover, leaving a single bar of
 * [switcher | actions | create | options]. Sized so the wide layout (search + 3
 * icon controls + view switcher) only ever renders when it genuinely fits —
 * narrow sidebars and split panes get the compact form automatically, with no
 * per-consumer flag.
 */
const COMPACT_BREAKPOINT = 360;

export interface DataViewToolbarProps {
  /**
   * Attached to the sticky toolbar element so the host can measure its height and
   * publish it as `--dv-header-offset` (grouped views stack their sticky group
   * headers below it).
   */
  stickyRef?: Ref<HTMLElement>;
  title?: ReactNode;
  query: string;
  onQueryChange: (next: string) => void;
  /** Consumer-supplied arbitrary toolbar actions. */
  actions?: ReactNode;
  /**
   * The consumer's create affordances. The toolbar owns the `CreatorsControl`
   * element (built once below) because it is the only component that knows
   * `compact` — a single creator folds to an icon `+` button when narrow.
   */
  creators?: CreateOption[];
  /** The editable view switcher. */
  switcher: ReactNode;
  /** Number of view instances — the switcher is hidden when compact unless >1. */
  switcherCount: number;
}

/**
 * The DataView toolbar — a `<Sticky>` header that adapts to its own width. Wide:
 * the full inline row. Narrow: the folded compact form, which is always exactly
 * ONE bar. The toolbar measures itself ({@link useElementSize}); the breakpoint
 * switch happens before paint, so there is no wide→compact flash.
 *
 * **It names no control.** It used to take `filterControl` / `sortControl` /
 * `fieldsControl` as three ReactNode props built by the host — the
 * collection-consumer rule broken literally, and the reason no plugin could add a
 * toolbar control. Now it reads `DataViewSlots.Control`, drops the ones that do
 * not apply to the active view + schema, orders them, and builds one identical
 * trigger per control.
 */
export function DataViewToolbar({
  stickyRef,
  title,
  query,
  onQueryChange,
  actions,
  creators,
  switcher,
  switcherCount,
}: DataViewToolbarProps): ReactNode {
  const [measureRef, { width }] = useElementSize();
  const compact = width > 0 && width < COMPACT_BREAKPOINT;
  const ctx = useDataViewControls();

  // Applicability and ordering, once, for both layouts. `isApplicable` is pure
  // and asked BEFORE anything mounts — a control that does not apply costs
  // nothing, not even a mounted-then-null component.
  const controls = DataViewSlots.Control.useContributions()
    .filter((c) => c.isApplicable?.(ctx) ?? true)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // The compact trigger's badge: what the open panels would tell you, added up.
  // Each control's own `summary` answers for itself (`count` defaults to the
  // whole thing it describes), so a new control counts into the badge with no
  // edit here — where the old `activeControlCount` prop hard-coded
  // `filter.ruleCount + sort.ruleCount` in the host.
  const activeCount =
    controls.reduce((sum, c) => {
      const s = c.summary?.(ctx) ?? null;
      return sum + (s ? (s.count ?? 1 + (s.more ?? 0)) : 0);
    }, 0) + (query.length > 0 ? 1 : 0);

  // Built once and relocated into whichever branch renders — the toolbar's
  // "each control element is built once" discipline. It folds on `compact`.
  const creatorsControl = (
    <CreatorsControl creators={creators} compact={compact} />
  );
  const searchInput = (
    <SearchInput
      value={query}
      onChange={(e) => onQueryChange(e.target.value)}
      placeholder="Search…"
      // Wide: a fixed lane in the inline row. Compact: full width of the options
      // popover (the wrapper's own block box) — hence no width class there.
      wrapperClassName={compact ? undefined : cn("w-48")}
    />
  );

  const titleNode = title ? (
    <Text as="div" variant="label">
      {title}
    </Text>
  ) : null;

  return (
    // `nav` (not the default `raised`) so the toolbar out-stacks the grouped
    // views' own sticky group headers (`raised`): an outgoing group header slides
    // UNDER the toolbar instead of painting over it during the sticky hand-off.
    <Sticky edge="top" mask layer="nav" ref={stickyRef}>
      <div
        ref={measureRef}
        // toolbar row of variable-content controls; no named-slot primitive maps. The Sticky's `mask` paints `bg-chrome-mask` so rows don't show through the pinned bar (and it matches whatever surface the DataView is embedded in)
        //
        // ONE line in BOTH layouts — no `flex-wrap`. Compact keeps every control
        // but the switcher behind the single options trigger, and the switcher
        // (whose chips deliberately never shrink — see EditableViewSwitcher) sits
        // in the shrinkable scroll lane below, so the trailing controls can never
        // be pushed past the container's edge and clipped.
        // eslint-disable-next-line layout/no-adhoc-layout
        className="flex items-center gap-sm py-sm rail-follow"
      >
        {compact ? (
          <>
            {/* The one shrinkable cell of the bar. The switcher's chips hug their
                content and never shrink, so when more views exist than fit, this
                lane scrolls horizontally rather than pushing the trailing controls
                out of reach. Scrollbar hidden — it is an overflow escape hatch, not
                a permanent affordance. */}
            <Scroll axis="x" fill hideScrollbar>
              <Stack direction="row" align="center" gap="sm">
                {titleNode}
                {switcherCount > 1 ? switcher : null}
              </Stack>
            </Scroll>
            {/* eslint-disable-next-line row-actions/no-raw-actions-slot -- surface-level toolbar actions, one per DataView, not a per-row cluster */}
            {actions}
            {creatorsControl}
            {/* Search folds in here with every control — a non-empty query
                counts toward the trigger's badge so a folded-away search is still
                visible from the closed bar. */}
            <CompactControls
              search={searchInput}
              controls={controls}
              activeCount={activeCount}
            />
          </>
        ) : (
          <>
            {titleNode}
            {/* The switcher grows (flex-1) to absorb the leading slack, so it
                pushes search + trailing controls to the right — no `ml-auto` margin
                needed (and an auto margin would steal the free space from the
                switcher's flex-grow, collapsing its hover-reveal spacer). */}
            {switcher}
            {searchInput}
            {controls.map((c) => (
              <ControlTrigger key={c.id} control={c} />
            ))}
            {/* eslint-disable-next-line row-actions/no-raw-actions-slot -- surface-level toolbar actions, one per DataView, not a per-row cluster */}
            {actions}
            {creatorsControl}
          </>
        )}
      </div>
    </Sticky>
  );
}
