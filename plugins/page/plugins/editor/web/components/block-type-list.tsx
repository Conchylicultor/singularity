import { useMemo } from "react";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
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

/**
 * Case-insensitive match on a block's menu `label` plus its declared `aliases`,
 * ranked by relevance: label matches outrank alias-only matches, and prefix
 * matches outrank substring matches. Original contribution/slot order is
 * preserved within each rank tier (stable sort).
 */
export function filterBlockTypes(
  blocks: BlockHandle<unknown>[],
  query: string,
): BlockHandle<unknown>[] {
  const q = query.trim().toLowerCase();
  if (!q) return blocks;

  // Lower rank = higher priority; Infinity = no match (filtered out).
  const rank = (b: BlockHandle<unknown>): number => {
    const label = b.label?.toLowerCase();
    if (label?.startsWith(q)) return 0;
    if (label?.includes(q)) return 1;
    const aliases = b.aliases?.map((a) => a.toLowerCase());
    if (aliases?.some((a) => a.startsWith(q))) return 2;
    if (aliases?.some((a) => a.includes(q))) return 3;
    return Infinity;
  };

  return blocks
    .map((b, i) => ({ b, i, r: rank(b) }))
    .filter((x) => x.r !== Infinity)
    .sort((a, b) => a.r - b.r || a.i - b.i) // tie-break on original index → stable
    .map((x) => x.b);
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
      <Text as="div" variant="body" className="text-muted-foreground px-sm py-xs">
        No block types
      </Text>
    );
  }

  return (
    <div className="flex flex-col">
      {blocks.map((block, i) => {
        const Icon = block.icon;
        return (
          <Row
            key={block.type}
            selected={i === activeIndex}
            icon={Icon ? <Icon className="text-muted-foreground size-4" /> : undefined}
            onMouseEnter={() => onHoverIndex(i)}
            onMouseDown={(e: React.MouseEvent) => {
              e.preventDefault();
              onSelect(block);
            }}
          >
            {block.label}
          </Row>
        );
      })}
    </div>
  );
}
