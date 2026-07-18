import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { revealElement } from "@plugins/primitives/plugins/scroll-reveal/web";
import { Dialog, DialogContent, ScrollArea } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Self-key the body on `open` so query + activeIdx re-initialize on every
            open via a fresh mount — no props-to-state reset effect. */}
        <QuickFindDialogBody
          key={open ? "open" : "closed"}
          open={open}
          onOpenChange={onOpenChange}
          sources={sources}
          placeholder={placeholder}
          onSelect={onSelect}
          renderIcon={renderIcon}
        />
      </DialogContent>
    </Dialog>
  );
}

function QuickFindDialogBody({
  open,
  onOpenChange,
  sources,
  placeholder = "Search…",
  onSelect,
  renderIcon,
}: QuickFindDialogProps) {
  const [query, setQuery] = useState("");
  // Set only by keyboard nav / hover; reset to 0 in the query onChange (where
  // new results originate) and clamped in render for the async-arrival edge case.
  const [activeIdx, setActiveIdx] = useState(0);
  const activeRef = useRef<HTMLButtonElement>(null);

  const { data: results, isFetching } = useSearch(query, { sources, enabled: open });
  const list = useMemo(() => results ?? [], [results]);

  // Derive the effective active index — never index past the current list, and
  // collapse to 0 when empty. Replaces the reset-to-0-on-results effect.
  const safeActiveIdx = list.length > 0 ? Math.min(activeIdx, list.length - 1) : 0;

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
        setActiveIdx((i) => (Math.min(i, list.length - 1) + 1) % list.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (Math.min(i, list.length - 1) - 1 + list.length) % list.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const chosen = list[safeActiveIdx];
        if (chosen) select(chosen);
      }
    },
    [list, safeActiveIdx, select],
  );

  useEffect(() => {
    revealElement(activeRef.current, { block: "nearest" });
  }, [safeActiveIdx]);

  const hasQuery = query.trim().length > 0;

  return (
    <Clip className="w-full max-w-lg rounded-xl">
    <Surface level="overlay" className="w-full rounded-xl shadow-2xl">
      <div className="border-b p-sm">
        <SearchInput
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // First result highlighted after each keystroke (results refresh).
            setActiveIdx(0);
          }}
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
            // eslint-disable-next-line data-view/no-adhoc-row-list -- Cmd-K transient search overlay
            list.map((result, idx) => (
              <Row
                key={`${result.source}:${result.entityId}`}
                ref={idx === safeActiveIdx ? activeRef : undefined}
                selected={idx === safeActiveIdx}
                icon={renderIcon?.(result)}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => select(result)}
              >
                {/* eslint-disable-next-line layout/no-adhoc-layout -- flexible leaf of Row's flex so the title truncates */}
                <Stack gap="2xs" align="start" className="min-w-0">
                  <Text as="span" variant="body" className="truncate">
                    {result.title || "Untitled"}
                  </Text>
                  {result.snippet && result.snippet !== result.title && (
                    <Snippet snippet={result.snippet} />
                  )}
                </Stack>
              </Row>
            ))
          )}
        </div>
      </ScrollArea>
    </Surface>
    </Clip>
  );
}
