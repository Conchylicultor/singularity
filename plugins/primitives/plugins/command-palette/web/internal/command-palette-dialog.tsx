import { cn, Dialog, DialogContent, ScrollArea } from "@plugins/primitives/plugins/ui-kit/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { useState, useMemo, useRef, useEffect, useCallback, forwardRef } from "react";
import { MdSearch } from "react-icons/md";
import { Kbd } from "@plugins/primitives/plugins/tooltip/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { CommandPaletteItem } from "../slots";
import { fuzzyMatch, type FuzzyMatch } from "./fuzzy";

interface CommandPaletteDialogProps {
  open: boolean;
  onClose: () => void;
  items: CommandPaletteItem[];
}

type ScoredItem = CommandPaletteItem & { _match: FuzzyMatch | null };

interface Group {
  label: string | null;
  items: ScoredItem[];
}

function bestMatch(query: string, item: CommandPaletteItem): FuzzyMatch | null {
  let best = fuzzyMatch(query, item.label);
  if (item.keywords) {
    for (const kw of item.keywords) {
      const m = fuzzyMatch(query, kw);
      if (m && (!best || m.score > best.score)) {
        best = { score: m.score, ranges: [] };
      }
    }
  }
  return best;
}

function groupItems(items: ScoredItem[]): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  for (const item of items) {
    const label = item.group ?? null;
    if (!current || current.label !== label) {
      current = { label, items: [] };
      groups.push(current);
    }
    current.items.push(item);
  }
  return groups;
}

function HighlightedLabel({
  label,
  ranges,
}: {
  label: string;
  ranges: [number, number][];
}) {
  if (ranges.length === 0) return <>{label}</>;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const [start, end] of ranges) {
    if (start > last) parts.push(label.slice(last, start));
    parts.push(
      <span key={start} className="font-semibold text-foreground">
        {label.slice(start, end)}
      </span>,
    );
    last = end;
  }
  if (last < label.length) parts.push(label.slice(last));
  return <>{parts}</>;
}

export function CommandPaletteDialog({
  open,
  onClose,
  items,
}: CommandPaletteDialogProps) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
    }
  }, [open]);

  const { filtered, groups } = useMemo(() => {
    if (!query) {
      const all: ScoredItem[] = items.map((item) => ({
        ...item,
        _match: null,
      }));
      return { filtered: all, groups: groupItems(all) };
    }
    const scored: ScoredItem[] = [];
    for (const item of items) {
      const m = bestMatch(query, item);
      if (m) scored.push({ ...item, _match: m });
    }
    scored.sort((a, b) => (b._match?.score ?? 0) - (a._match?.score ?? 0));
    return { filtered: scored, groups: null };
  }, [items, query]);

  const flatList = groups ? groups.flatMap((g) => g.items) : filtered;

  const select = useCallback(
    (item: ScoredItem) => {
      item.onSelect();
      onClose();
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % flatList.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + flatList.length) % flatList.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatList[activeIdx]) select(flatList[activeIdx]);
      }
    },
    [flatList, activeIdx, select],
  );

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  let flatIdx = 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <Surface level="overlay" className="w-full max-w-lg overflow-hidden rounded-xl shadow-2xl">
          <div className="flex items-center gap-sm border-b px-md py-sm">
            <MdSearch className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIdx(0);
              }}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground"
              placeholder="Search commands..."
            />
          </div>

          <ScrollArea className="max-h-80">
            <div className="p-xs">
              {flatList.length === 0 && (
                <Text
                  as="p"
                  variant="body"
                  className="px-md py-xl text-center text-muted-foreground"
                >
                  No commands found.
                </Text>
              )}

              {groups
                ? groups.map((group) => (
                    <div key={group.label ?? "__ungrouped"}>
                      {group.label && (
                        <Text
                          as="div"
                          variant="caption"
                          className="px-sm py-xs font-medium text-muted-foreground"
                        >
                          {group.label}
                        </Text>
                      )}
                      {group.items.map((item) => {
                        const idx = flatIdx++;
                        return (
                          <CommandRow
                            key={item.id}
                            item={item}
                            isActive={idx === activeIdx}
                            ref={idx === activeIdx ? activeRef : undefined}
                            onMouseEnter={() => setActiveIdx(idx)}
                            onClick={() => select(item)}
                          />
                        );
                      })}
                    </div>
                  ))
                : filtered.map((item) => {
                    const idx = flatIdx++;
                    return (
                      <CommandRow
                        key={item.id}
                        item={item}
                        isActive={idx === activeIdx}
                        ref={idx === activeIdx ? activeRef : undefined}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => select(item)}
                      />
                    );
                  })}
            </div>
          </ScrollArea>

          <Text
            as="div"
            variant="caption"
            className="flex gap-md border-t px-md py-xs text-muted-foreground"
          >
            <span>
              <Kbd className="border-muted-foreground/30 bg-muted-foreground/10 text-muted-foreground">
                ↑↓
              </Kbd>{" "}
              navigate
            </span>
            <span>
              <Kbd className="border-muted-foreground/30 bg-muted-foreground/10 text-muted-foreground">
                ↵
              </Kbd>{" "}
              select
            </span>
            <span>
              <Kbd className="border-muted-foreground/30 bg-muted-foreground/10 text-muted-foreground">
                esc
              </Kbd>{" "}
              close
            </span>
          </Text>
        </Surface>
      </DialogContent>
    </Dialog>
  );
}

const CommandRow = forwardRef<
  HTMLDivElement,
  {
    item: ScoredItem;
    isActive: boolean;
    onMouseEnter: () => void;
    onClick: () => void;
  }
>(function CommandRow({ item, isActive, onMouseEnter, onClick }, ref) {
  const Icon = item.icon;
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={isActive}
      className={cn(
        "flex cursor-pointer items-center gap-sm rounded-md px-sm py-xs text-body",
        isActive && "bg-accent text-accent-foreground",
      )}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
      <span className="flex-1 truncate text-muted-foreground">
        <HighlightedLabel
          label={item.label}
          ranges={item._match?.ranges ?? []}
        />
      </span>
      {item.shortcut && (
        <Kbd className="border-muted-foreground/30 bg-muted-foreground/10 text-muted-foreground">
          {item.shortcut}
        </Kbd>
      )}
    </div>
  );
});
