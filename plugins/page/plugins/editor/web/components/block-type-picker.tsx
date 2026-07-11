import { useMemo, useState } from "react";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { BlockHandle } from "../../core";
import {
  useGroupedInsertableBlocks,
  flattenSections,
  filterBlockTypes,
  BlockTypeList,
} from "./block-type-list";

/**
 * The menu BODY shared by the "pick, THEN create" block-type pickers — the
 * bottom "Add block" button (`AddBlockMenu`) and the turn-into menu
 * (`BlockTypeMenu`): a filter field over `BlockTypeList`, with Arrow/Enter/
 * Escape navigation driven from that field. It owns neither a surface nor an
 * open-state — the caller supplies the popover and decides what "commit" and
 * "cancel" mean. Here nothing exists until a type is chosen; dismissing is a
 * no-op. (The gutter `+` runs the inverse flow — create THEN type — over the
 * shared caret menu inline, so it does NOT use this body; see `BlockMenuPlugin`
 * / `useInsertBlockBelow`.)
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
  const grouped = useGroupedInsertableBlocks();
  const flatAll = useMemo(() => flattenSections(grouped), [grouped]);

  // Filtering collapses to one flat label-less section (a relevance-ranked list);
  // an empty query shows the authored grouped sections. `flat` is the keyboard
  // nav index space over the selectable rows `BlockTypeList` renders.
  const sections = useMemo(
    () => (query ? [{ blocks: filterBlockTypes(flatAll, query) }] : grouped),
    [query, flatAll, grouped],
  );
  const flat = useMemo(() => flattenSections(sections), [sections]);

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
            setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const block = flat[activeIndex];
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
          sections={sections}
          activeIndex={activeIndex}
          onSelect={onSelect}
          onHoverIndex={setActiveIndex}
        />
      </Scroll>
    </Stack>
  );
}
