import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { BlockHandle } from "../../core";
import { Editor } from "../slots";

/**
 * Insertable block types from the `Editor.Block` dispatch slot. A contribution
 * carries its `block` handle; only types declaring a menu `label` are offered.
 * Shared by every block-type picker (Add block menu, gutter `+`, turn-into,
 * slash menu).
 */
export function useInsertableBlocks(): BlockHandle<unknown>[] {
  const contributions = Editor.Block.useContributions();
  return useMemo(
    () => contributions.map((c) => c.block).filter((b) => b.label),
    [contributions],
  );
}

/** Case-insensitive substring match on the block's menu `label`. */
export function filterBlockTypes(
  blocks: BlockHandle<unknown>[],
  query: string,
): BlockHandle<unknown>[] {
  const q = query.trim().toLowerCase();
  if (!q) return blocks;
  return blocks.filter((b) => b.label?.toLowerCase().includes(q));
}

/**
 * Presentational list of block-type rows (icon + label) with an active-row
 * highlight. Item buttons use `onMouseDown` + `preventDefault` so clicking does
 * not blur an editor the consumer relies on keeping focused (e.g. the slash menu).
 */
export function BlockTypeList({
  blocks,
  activeIndex,
  onSelect,
  onHoverIndex,
}: {
  blocks: BlockHandle<unknown>[];
  activeIndex: number;
  onSelect: (block: BlockHandle<unknown>) => void;
  onHoverIndex: (index: number) => void;
}) {
  if (blocks.length === 0) {
    return (
      <div className="text-muted-foreground px-2 py-1.5 text-sm">No block types</div>
    );
  }

  return (
    <div className="flex flex-col">
      {blocks.map((block, i) => {
        const Icon = block.icon;
        return (
          <button
            key={block.type}
            type="button"
            className={cn(
              "flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
              i === activeIndex && "bg-accent",
            )}
            onMouseEnter={() => onHoverIndex(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(block);
            }}
          >
            {Icon ? <Icon className="text-muted-foreground size-4" /> : null}
            {block.label}
          </button>
        );
      })}
    </div>
  );
}
