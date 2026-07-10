import { useState, type ReactNode, type Ref } from "react";
import { MdArrowBack, MdSearch } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useElementSize } from "@plugins/primitives/plugins/element-size/web";
import type { CreateOption } from "../../../core";
import { CompactControls } from "./compact-controls";
import { CreatorsControl } from "../creators-control";

/**
 * Below this container width the toolbar folds: search collapses to a magnifier
 * that expands inline, and sort/filter/fields collapse behind one `MdTune`
 * options popover. Sized so the wide layout (search + 3 icon controls + view
 * switcher) only ever renders when it genuinely fits — narrow sidebars and split
 * panes get the compact form automatically, with no per-consumer flag.
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
 * the full inline row (unchanged). Narrow: the folded compact form. The toolbar
 * measures itself ({@link useElementSize}); the breakpoint switch happens before
 * paint, so there is no wide→compact flash.
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
  const [searchOpen, setSearchOpen] = useState(false);
  const compact = width > 0 && width < COMPACT_BREAKPOINT;
  // Built once and relocated into whichever branch renders — the toolbar's
  // "each control element is built once" discipline. It folds on `compact`.
  const creatorsControl = <CreatorsControl creators={creators} compact={compact} />;
  // Keep search expanded whenever there's an active query, so the filter stays
  // visible and clearable even after a blur.
  const searchExpanded = searchOpen || query.length > 0;

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
        // `flex-wrap` only when compact. The switcher deliberately never shrinks
        // (its chips hug their content — see EditableViewSwitcher), so in a narrow
        // host a multi-view switcher plus the trailing icon controls cannot share
        // one line: without wrapping, the creator and the options gear are pushed
        // past the container's edge and clipped, i.e. unreachable. Wrapping is
        // self-limiting — it engages only on the lines that actually overflow, so a
        // compact toolbar that already fits (≤1 view ⇒ switcher hidden) stays one row.
        // eslint-disable-next-line layout/no-adhoc-layout
        className={cn("flex items-center gap-sm pb-sm pl-sm", compact && "flex-wrap")}
      >
        {compact ? (
          searchExpanded ? (
            <>
              <SearchInput
                autoFocus
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search…"
                wrapperClassName="flex-1 min-w-0"
                onBlur={() => {
                  if (query.length === 0) setSearchOpen(false);
                }}
              />
              <IconButton
                icon={MdArrowBack}
                label="Close search"
                onClick={() => {
                  onQueryChange("");
                  setSearchOpen(false);
                }}
              />
            </>
          ) : (
            <>
              {titleNode}
              {switcherCount > 1 ? switcher : null}
              <IconButton
                className="ml-auto"
                icon={MdSearch}
                label="Search"
                onClick={() => setSearchOpen(true)}
              />
              {actions}
              {creatorsControl}
              <CompactControls
                entries={[
                  ...(filterControl
                    ? [{ label: "Filter", control: filterControl }]
                    : []),
                  ...(sortControl ? [{ label: "Sort", control: sortControl }] : []),
                  ...(fieldsControl
                    ? [{ label: "Fields", control: fieldsControl }]
                    : []),
                ]}
                activeCount={activeControlCount}
              />
            </>
          )
        ) : (
          <>
            {titleNode}
            {switcher}
            <SearchInput
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search…"
              // The switcher now grows (flex-1) to absorb the leading slack, so it
              // pushes search + trailing controls to the right — no `ml-auto` margin
              // needed (and an auto margin would steal the free space from the
              // switcher's flex-grow, collapsing its hover-reveal spacer).
              wrapperClassName="w-48"
            />
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
