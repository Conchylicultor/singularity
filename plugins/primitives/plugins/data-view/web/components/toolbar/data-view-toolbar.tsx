import { type ReactNode, type Ref } from "react";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { useElementSize } from "@plugins/primitives/plugins/element-size/web";
import type { CreateOption } from "../../../core";
import { CompactControls } from "./compact-controls";
import { CreatorsControl } from "../creators-control";

/**
 * Below this container width the toolbar folds: search AND sort/filter/fields
 * all collapse behind one `MdTune` options popover, leaving a single bar of
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
  /** Sort trigger (icon button + builder popover), or null when unsupported. */
  sortControl: ReactNode | null;
  /** Filter trigger, or null when the schema has no filterable field. */
  filterControl: ReactNode | null;
  /** Custom-columns "Fields" trigger, or null when opted out. */
  fieldsControl: ReactNode | null;
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
  /** Active sort + filter rule count, surfaced as the compact options badge. */
  activeControlCount: number;
}

/**
 * The DataView toolbar — a `<Sticky>` header that adapts to its own width. Wide:
 * the full inline row (unchanged). Narrow: the folded compact form, which is
 * always exactly ONE bar. The toolbar measures itself ({@link useElementSize});
 * the breakpoint switch happens before paint, so there is no wide→compact flash.
 */
export function DataViewToolbar({
  stickyRef,
  title,
  query,
  onQueryChange,
  sortControl,
  filterControl,
  fieldsControl,
  actions,
  creators,
  switcher,
  switcherCount,
  activeControlCount,
}: DataViewToolbarProps): ReactNode {
  const [measureRef, { width }] = useElementSize();
  const compact = width > 0 && width < COMPACT_BREAKPOINT;
  // Built once and relocated into whichever branch renders — the toolbar's
  // "each control element is built once" discipline. It folds on `compact`.
  const creatorsControl = <CreatorsControl creators={creators} compact={compact} />;
  const searchInput = (
    <SearchInput
      value={query}
      onChange={(e) => onQueryChange(e.target.value)}
      placeholder="Search…"
      // Wide: a fixed lane in the inline row. Compact: full width of the options
      // popover (the wrapper's own block box) — hence no width class there.
      wrapperClassName={compact ? undefined : "w-48"}
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
        className="flex items-center gap-sm py-sm px-pane-gutter"
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
            {actions}
            {creatorsControl}
            {/* Search folds in here with sort/filter/fields — a non-empty query
                counts toward the trigger's badge so a folded-away search is still
                visible from the closed bar. */}
            <CompactControls
              search={searchInput}
              entries={[
                ...(filterControl
                  ? [{ label: "Filter", control: filterControl }]
                  : []),
                ...(sortControl ? [{ label: "Sort", control: sortControl }] : []),
                ...(fieldsControl
                  ? [{ label: "Fields", control: fieldsControl }]
                  : []),
              ]}
              activeCount={activeControlCount + (query.length > 0 ? 1 : 0)}
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
            {filterControl}
            {sortControl}
            {actions}
            {fieldsControl}
            {creatorsControl}
          </>
        )}
      </div>
    </Sticky>
  );
}
