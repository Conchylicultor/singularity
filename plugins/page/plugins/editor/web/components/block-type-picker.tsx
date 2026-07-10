import { useMemo, useState } from "react";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { BlockHandle } from "../../core";
import { useInsertableBlocks, filterBlockTypes, BlockTypeList } from "./block-type-list";

/**
 * The menu BODY shared by every click-opened block-type picker: a filter field
 * over `BlockTypeList`, with Arrow/Enter/Escape navigation driven from that
 * field. It owns neither a surface nor an open-state — the caller supplies the
 * popover and decides what "commit" and "cancel" mean:
 *
 * - `BlockTypeMenu` / `AddBlockMenu` create a block OF the chosen type.
 * - `InsertBlockBelowMenu` (the gutter `+`) creates the block FIRST and
 *   converts it, so cancelling still leaves the new block behind.
 *
 * Separating the body from the surface is what lets those two flows share one
 * keyboard model instead of re-deriving it per affordance.
 */
export function BlockTypePicker({
  onSelect,
  onDismiss,
  placeholder = "Type to filter...",
}: {
  onSelect: (block: BlockHandle<unknown>) => void;
  /** Escape pressed in the filter field — the caller closes its surface. */
  onDismiss: () => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const blocks = useInsertableBlocks();

  const filtered = useMemo(() => filterBlockTypes(blocks, query), [blocks, query]);

  return (
    <Stack gap="xs">
      <SearchInput
        autoFocus
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const block = filtered[activeIndex];
            if (block) onSelect(block);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onDismiss();
          }
        }}
      />
      {/* Only the list scrolls: the filter field stays pinned, so a long block-type
          registry never pushes the thing you are typing into off the surface. */}
      <Scroll className="max-h-72">
        <BlockTypeList
          blocks={filtered}
          activeIndex={activeIndex}
          onSelect={onSelect}
          onHoverIndex={setActiveIndex}
        />
      </Scroll>
    </Stack>
  );
}
