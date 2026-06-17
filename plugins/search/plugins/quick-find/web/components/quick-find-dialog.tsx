import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Dialog, DialogContent, ScrollArea } from "@plugins/primitives/plugins/ui-kit/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { SearchResult } from "@plugins/search/plugins/engine/core";
import { useSearch } from "../internal/use-search";
import { parseHighlightedSnippet } from "../internal/parse-snippet";

export interface QuickFindDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Restrict the search to these source ids (omit to search every source). */
  sources?: string[];
  /** Search-input placeholder. Default "Search…". */
  placeholder?: string;
  /** Called with the chosen result; the host owns navigation. */
  onSelect: (result: SearchResult) => void;
  /** Optional per-result leading icon (e.g. a page icon from result.metadata). */
  renderIcon?: (result: SearchResult) => ReactNode;
}

// Render a highlighted snippet as React nodes (no dangerouslySetInnerHTML).
function Snippet({ snippet }: { snippet: string }) {
  const segments = parseHighlightedSnippet(snippet);
  return (
    <span className="truncate text-caption text-muted-foreground">
      {segments.map((seg, i) =>
        seg.highlight ? (
          <mark key={i} className="rounded-sm bg-primary/15 px-2xs font-medium text-primary">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  );
}

export function QuickFindDialog({
  open,
  onOpenChange,
  sources,
  placeholder = "Search…",
  onSelect,
  renderIcon,
}: QuickFindDialogProps) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Reset transient state every time the dialog opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
    }
  }, [open]);

  const { data: results, isFetching } = useSearch(query, { sources, enabled: open });
  const list = useMemo(() => results ?? [], [results]);

  useEffect(() => {
    setActiveIdx(0);
  }, [results]);

  const select = useCallback(
    (result: SearchResult) => {
      onSelect(result);
      onOpenChange(false);
    },
    [onSelect, onOpenChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (list.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % list.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + list.length) % list.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const chosen = list[activeIdx];
        if (chosen) select(chosen);
      }
    },
    [list, activeIdx, select],
  );

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const hasQuery = query.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <Surface level="overlay" className="w-full max-w-lg overflow-hidden rounded-xl shadow-2xl">
          <div className="border-b p-sm">
            <SearchInput
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
            />
          </div>

          <ScrollArea className="max-h-80">
            <div className="p-xs">
              {!hasQuery ? (
                <Placeholder>Type to search.</Placeholder>
              ) : isFetching && list.length === 0 ? (
                <Loading variant="rows" />
              ) : list.length === 0 ? (
                <Placeholder>No results.</Placeholder>
              ) : (
                list.map((result, idx) => (
                  <Row
                    key={`${result.source}:${result.entityId}`}
                    ref={idx === activeIdx ? activeRef : undefined}
                    selected={idx === activeIdx}
                    icon={renderIcon?.(result)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => select(result)}
                    className="flex-col items-start gap-2xs"
                  >
                    <Text as="span" variant="body" className="truncate">
                      {result.title || "Untitled"}
                    </Text>
                    {result.snippet && result.snippet !== result.title && (
                      <Snippet snippet={result.snippet} />
                    )}
                  </Row>
                ))
              )}
            </div>
          </ScrollArea>
        </Surface>
      </DialogContent>
    </Dialog>
  );
}
