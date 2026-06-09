import { useState, useRef, useEffect } from "react";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { MdClose, MdSearch } from "react-icons/md";
import { cn } from "@/lib/utils";
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
      <div className="flex items-center justify-between px-1 pt-1 pb-1.5">
        <SectionLabel as="span" className="text-3xs">
          Icon{!fullSet && <span className="ml-1 opacity-50">· loading…</span>}
        </SectionLabel>
        {fullSet && (
          <span className="text-3xs text-muted-foreground/50">{iconCount} icons</span>
        )}
      </div>
      <div className="relative mx-1 mb-2">
        <MdSearch className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons…"
          className="w-full rounded-md border border-input bg-background py-1 pl-7 pr-7 text-xs outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
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
      <div className="max-h-64 overflow-y-auto px-1 pb-1 space-y-2">
        {!fullSet ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Loading icons…</p>
        ) : isSearching ? (
          searchResults.length > 0 ? (
            <div className="grid grid-cols-9 gap-1">
              {searchResults.map((entry) => (
                <IconBtn key={entry.key} entry={entry} selected={value === entry.key} onPick={pickIcon} />
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No icons match &ldquo;{query}&rdquo;
            </p>
          )
        ) : (
          fullSet.categories.map((cat) => (
            <div key={cat.label}>
              <SectionLabel className="mb-1 text-3xs text-muted-foreground/60">
                {cat.label}
              </SectionLabel>
              <div className="grid grid-cols-9 gap-1">
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
