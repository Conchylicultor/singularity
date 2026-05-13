import { useState, useRef, useEffect, type ReactNode } from "react";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { MdClose, MdSearch } from "react-icons/md";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AVATAR_COLOR_KEYS, AVATAR_COLORS, type AvatarColor } from "../internal/colors";
import {
  loadFullIconSet,
  extractSvgNodes,
  type SvgNode,
  type FullIconSet,
  type FullIconEntry,
} from "../internal/icons";

export interface AvatarSpec {
  icon: string | null;
  color: string | null;
  svgNodes: SvgNode[] | null;
}

export interface AvatarPickerProps {
  value: AvatarSpec;
  onChange: (next: AvatarSpec) => void | Promise<void>;
  children: ReactNode;
  triggerClassName?: string;
  triggerLabel?: string;
}

export function AvatarPicker({
  value,
  onChange,
  children,
  triggerClassName,
  triggerLabel,
}: AvatarPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fullSet, setFullSet] = useState<FullIconSet | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    void loadFullIconSet().then(setFullSet);
  }, [open]);

  const pickIcon = (entry: FullIconEntry) => {
    const svgNodes = extractSvgNodes(entry.Icon);
    void onChange({ ...value, icon: entry.key, svgNodes });
  };
  const pickColor = (color: AvatarColor) => void onChange({ ...value, color });

  const isSearching = query.trim().length > 0;

  const searchResults: FullIconEntry[] = isSearching && fullSet
    ? fullSet.search(query)
    : [];

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger
        className={cn("rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring", triggerClassName)}
        aria-label={triggerLabel ?? "Pick avatar"}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">

        {/* Color row */}
        <SectionLabel className="px-1 pt-1 pb-1.5 text-[10px]">
          Color
        </SectionLabel>
        <div className="flex flex-wrap gap-1.5 px-1 pb-2">
          {AVATAR_COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              aria-pressed={value.color === key}
              onClick={() => pickColor(key)}
              className={cn(
                "size-5 rounded-full border border-border transition-transform",
                AVATAR_COLORS[key],
                value.color === key && "scale-110 ring-2 ring-ring ring-offset-1 ring-offset-background",
              )}
            />
          ))}
        </div>

        {/* Icon header + search */}
        <div className="flex items-center justify-between px-1 pt-1 pb-1.5">
          <SectionLabel as="span" className="text-[10px]">
            Icon{!fullSet && <span className="ml-1 opacity-50">· loading…</span>}
          </SectionLabel>
          {fullSet && (
            <span className="text-[10px] text-muted-foreground/50">{Object.keys(fullSet.categories).length > 0 ? "2 160 icons" : ""}</span>
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
                  <IconBtn key={entry.key} entry={entry} selected={value.icon === entry.key} onPick={pickIcon} />
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
                <SectionLabel className="mb-1 text-[9px] text-muted-foreground/60">
                  {cat.label}
                </SectionLabel>
                <div className="grid grid-cols-9 gap-1">
                  {cat.entries.map((entry) => (
                    <IconBtn key={entry.key} entry={entry} selected={value.icon === entry.key} onPick={pickIcon} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Clear */}
        {(value.icon || value.color) && (
          <>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => void onChange({ icon: null, color: null, svgNodes: null })}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
            >
              Clear
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
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
