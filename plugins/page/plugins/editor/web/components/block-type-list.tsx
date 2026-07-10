import { useEffect, useMemo, useRef } from "react";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { BlockHandle } from "../../core";
import { Editor } from "../slots";
import { useEnabledBlockTypes } from "../block-editor-context";

/**
 * Insertable block types from the `Editor.Block` dispatch slot. A contribution
 * carries its `block` handle; only types declaring a menu `label` are offered.
 * Shared by every block-type picker (Add block menu, gutter `+`, turn-into,
 * slash menu). When the enclosing `BlockEditorProvider` sets an
 * `enabledBlockTypes` allowlist (e.g. the in-memory demo's curated text
 * palette), non-listed types are dropped here so every picker respects it with
 * no per-menu wiring.
 */
export function useInsertableBlocks(): BlockHandle<unknown>[] {
  const contributions = Editor.Block.useContributions();
  const enabled = useEnabledBlockTypes();
  return useMemo(
    () =>
      contributions
        .map((c) => c.block)
        .filter((b) => b.label && (!enabled || enabled.includes(b.type))),
    [contributions, enabled],
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
 * One block-type row. It keeps ITSELF in view while active, so arrowing past the
 * fold of a scroll-capped menu follows the highlight. `block: "nearest"` is a
 * no-op when the row is already visible, which is why hover — which also moves
 * the active index — never yanks the list.
 */
function BlockTypeRow({
  block,
  active,
  onSelect,
  onHover,
}: {
  block: BlockHandle<unknown>;
  active: boolean;
  onSelect: (block: BlockHandle<unknown>) => void;
  onHover: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const Icon = block.icon;

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Row
      ref={ref}
      selected={active}
      icon={Icon ? <Icon className="text-muted-foreground size-4" /> : undefined}
      onMouseEnter={onHover}
      onMouseDown={(e: React.MouseEvent) => {
        e.preventDefault();
        onSelect(block);
      }}
    >
      {block.label}
    </Row>
  );
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
    <Stack gap="none">
      {blocks.map((block, i) => (
        <BlockTypeRow
          key={block.type}
          block={block}
          active={i === activeIndex}
          onSelect={onSelect}
          onHover={() => onHoverIndex(i)}
        />
      ))}
    </Stack>
  );
}
