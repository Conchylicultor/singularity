import { useState, type ReactNode } from "react";
import { MdArrowBack, MdSearch } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useElementSize } from "@plugins/primitives/plugins/element-size/web";
import { CompactControls } from "./compact-controls";

/**
 * Below this container width the toolbar folds: search collapses to a magnifier
 * that expands inline, and sort/filter/fields collapse behind one `MdTune`
 * options popover. Sized so the wide layout (search + 3 icon controls + view
 * switcher) only ever renders when it genuinely fits — narrow sidebars and split
 * panes get the compact form automatically, with no per-consumer flag.
 */
const COMPACT_BREAKPOINT = 360;

export interface DataViewToolbarProps {
  title?: ReactNode;
  query: string;
  onQueryChange: (next: string) => void;
  /** Sort trigger (icon button + builder popover), or null when unsupported. */
  sortControl: ReactNode | null;
  /** Properties trigger (per-view visible fields + order), or null when there is nothing to configure. */
  propertiesControl: ReactNode | null;
  /** Filter trigger, or null when the schema has no filterable field. */
  filterControl: ReactNode | null;
  /** Custom-columns "Fields" trigger, or null when opted out. */
  fieldsControl: ReactNode | null;
  /** Consumer-supplied arbitrary toolbar actions. */
  actions?: ReactNode;
  /** The `CreatorsControl` element (renders nothing when there are no creators). */
  creatorsControl: ReactNode;
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
  title,
  query,
  onQueryChange,
  sortControl,
  propertiesControl,
  filterControl,
  fieldsControl,
  actions,
  creatorsControl,
  switcher,
  switcherCount,
  activeControlCount,
}: DataViewToolbarProps): ReactNode {
  const [measureRef, { width }] = useElementSize();
  const [searchOpen, setSearchOpen] = useState(false);
  const compact = width > 0 && width < COMPACT_BREAKPOINT;
  // Keep search expanded whenever there's an active query, so the filter stays
  // visible and clearable even after a blur.
  const searchExpanded = searchOpen || query.length > 0;

  const titleNode = title ? (
    <Text as="div" variant="label">
      {title}
    </Text>
  ) : null;

  return (
    <Sticky edge="top" className="bg-background">
      <div
        ref={measureRef}
        // toolbar row of variable-content controls; no named-slot primitive maps. `bg-background` (on the Sticky) so rows don't show through the pinned bar
        // eslint-disable-next-line layout/no-adhoc-layout
        className={cn("flex items-center gap-sm pb-sm pl-sm")}
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
                  ...(propertiesControl
                    ? [{ label: "Properties", control: propertiesControl }]
                    : []),
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
              wrapperClassName="ml-auto w-48"
            />
            {filterControl}
            {sortControl}
            {propertiesControl}
            {actions}
            {fieldsControl}
            {creatorsControl}
          </>
        )}
      </div>
    </Sticky>
  );
}
