import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useState, useRef, useEffect } from "react";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/section-label/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { MdClose, MdSearch } from "react-icons/md";
import {
  loadFullIconSet,
  extractSvgNodes,
  type SvgNode,
  type FullIconSet,
  type FullIconEntry,
} from "../internal/icons";

export interface IconSelection {
  /** The Material Design icon key (e.g. `"rocket"`). */
  key: string;
  /** The icon's extracted SVG child-tree, ready to store and render. */
  svgNodes: SvgNode[];
}

export interface IconPickerProps {
  /** Currently-selected icon key, highlighted in the grid. */
  value: string | null;
  /** Fired when an icon is picked, with its key and extracted SVG nodes. */
  onSelect: (selection: IconSelection) => void;
  className?: string;
}

/**
 * Searchable, categorized grid of the full Material Design icon set. Loads the
 * icon registry lazily on first mount, so callers should only mount it when the
 * picker is visible (e.g. inside an open popover). Renders just the icon block
 * (header + search + grid) — surface chrome (popover, color rows) is the
 * caller's responsibility.
 */
export function IconPicker({ value, onSelect, className }: IconPickerProps) {
  const [query, setQuery] = useState("");
  const [fullSet, setFullSet] = useState<FullIconSet | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadFullIconSet().then(setFullSet);
  }, []);

  const pickIcon = (entry: FullIconEntry) => {
    onSelect({ key: entry.key, svgNodes: extractSvgNodes(entry.Icon) });
  };

  const isSearching = query.trim().length > 0;
  const searchResults: FullIconEntry[] = isSearching && fullSet ? fullSet.search(query) : [];
  const iconCount = fullSet
    ? fullSet.categories.reduce((n, cat) => n + cat.entries.length, 0)
    : 0;

  return (
    <div className={className}>
      {/* Header + search */}
      <div className="flex items-center justify-between px-xs pt-xs pb-xs">
        <SectionLabel as="span" className="text-3xs">
          {/* eslint-disable-next-line spacing/no-adhoc-spacing -- inline left offset on the "loading…" suffix next to the label text */}
          Icon{!fullSet && <span className="ml-1 opacity-50">· loading…</span>}
        </SectionLabel>
        {fullSet && (
          <span className="text-3xs text-muted-foreground/50">{iconCount} icons</span>
        )}
      </div>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- one-off horizontal inset + bottom offset on the search box within the picker block */}
      <div className="relative mx-1 mb-2">
        <MdSearch className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons…"
          // eslint-disable-next-line spacing/no-adhoc-spacing -- pl-7/pr-7 reserve gutters sized to the absolutely-positioned search icon and clear button
          className="w-full rounded-md border border-input bg-background py-xs pl-7 pr-7 text-caption outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); searchRef.current?.focus(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <MdClose className="size-3.5" />
          </button>
        )}
      </div>

      {/* Icon grid */}
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- space-y between conditional category blocks inside a padded scroll container; not a plain flex stack */}
      <div className="max-h-64 overflow-y-auto px-xs pb-xs space-y-2">
        {!fullSet ? (
          <Loading label="Loading icons…" className="py-2xl text-center" />
        ) : isSearching ? (
          searchResults.length > 0 ? (
            <div className="grid grid-cols-9 gap-xs">
              {searchResults.map((entry) => (
                <IconBtn key={entry.key} entry={entry} selected={value === entry.key} onPick={pickIcon} />
              ))}
            </div>
          ) : (
            <Text as="p" variant="caption" className="py-lg text-center text-muted-foreground">
              No icons match &ldquo;{query}&rdquo;
            </Text>
          )
        ) : (
          fullSet.categories.map((cat) => (
            <div key={cat.label}>
              {/* eslint-disable-next-line spacing/no-adhoc-spacing -- bottom offset between a category label and its icon grid */}
              <SectionLabel className="mb-1 text-3xs text-muted-foreground/60">
                {cat.label}
              </SectionLabel>
              <div className="grid grid-cols-9 gap-xs">
                {cat.entries.map((entry) => (
                  <IconBtn key={entry.key} entry={entry} selected={value === entry.key} onPick={pickIcon} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function IconBtn({ entry, selected, onPick }: { entry: FullIconEntry; selected: boolean; onPick: (e: FullIconEntry) => void }) {
  const Icon = entry.Icon;
  return (
    <button
      type="button"
      aria-label={entry.key}
      aria-pressed={selected}
      title={entry.key.replace(/_/g, " ")}
      onClick={() => onPick(entry)}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-foreground/80 hover:bg-accent",
        selected && "bg-accent text-foreground ring-1 ring-ring",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
