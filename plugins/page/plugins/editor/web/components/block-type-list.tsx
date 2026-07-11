import { useEffect, useMemo, useRef } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { useReorderedEntries } from "@plugins/reorder/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { BlockHandle } from "../../core";
import { Editor } from "../slots";
import { useEnabledBlockTypes } from "../block-editor-context";
import {
  entriesToSections,
  flattenSections,
  type BlockSection,
} from "../internal/block-sections";

export { flattenSections } from "../internal/block-sections";
export type { BlockSection } from "../internal/block-sections";

/**
 * Insertable block types grouped by the `page.editor.block` slot's authored
 * config tree (Notion-style sections: "Basic blocks", "Media", …). The grouping
 * layout lives ENTIRELY in `config/page/editor/page.editor.block.jsonc` — block
 * plugins stay group-blind. A contribution carries its `block` handle; only types
 * declaring a menu `label` are offered, and when the enclosing
 * `BlockEditorProvider` sets an `enabledBlockTypes` allowlist (the in-memory
 * demo's curated text palette), non-listed types drop out — so every picker
 * respects both with no per-menu wiring. Emptied sections are dropped.
 */
export function useGroupedInsertableBlocks(): BlockSection[] {
  const contributions = Editor.Block.useContributions();
  const enabled = useEnabledBlockTypes();
  // The clean contributions carry `_pluginId` + `id`, which is all the reorder
  // entryKey needs; they lack `_slotId`, so widen through `unknown`.
  const { entries } = useReorderedEntries(
    "page.editor.block",
    contributions as unknown as Contribution[],
  );
  return useMemo(() => entriesToSections(entries, enabled), [entries, enabled]);
}

/**
 * Flat insertable block list in authored-config order — `useGroupedInsertableBlocks`
 * flattened. Shared by the flat consumers (turn-into menu, `BlockTypeMenu`), which
 * inherit the group ordering for free while ignoring the section boundaries.
 */
export function useInsertableBlocks(): BlockHandle<unknown>[] {
  const sections = useGroupedInsertableBlocks();
  return useMemo(() => flattenSections(sections), [sections]);
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
 *
 * The press wiring has two shapes, because this row is shared by two kinds of
 * surface (see `BlockTypeList`):
 *
 * - **Caret menu** (slash / gutter-`+`): `onCommit` is set. It commits on
 *   `onPointerDown` because the menu is a focus-less surface over a live editor
 *   caret — a press perturbs the host selection and unmounts this row before a
 *   `mousedown` could fire (see `useCaretMenu`'s `commit`).
 * - **Focused popover picker** (Add block / turn-into): only `onSelect` is set.
 *   It commits on `onMouseDown` + `preventDefault` so the click never blurs the
 *   picker's own search field.
 */
function BlockTypeRow({
  block,
  active,
  onSelect,
  onCommit,
  onHover,
}: {
  block: BlockHandle<unknown>;
  active: boolean;
  /** Focused-picker commit — fires on `onMouseDown`. */
  onSelect?: (block: BlockHandle<unknown>) => void;
  /** Caret-menu commit (already `editor.update`-wrapped) — fires on `onPointerDown`. */
  onCommit?: () => void;
  onHover: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const Icon = block.icon;

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pressProps = onCommit
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          e.preventDefault();
          onCommit();
        },
      }
    : {
        onMouseDown: (e: React.MouseEvent) => {
          e.preventDefault();
          onSelect?.(block);
        },
      };

  return (
    <Row
      ref={ref}
      selected={active}
      icon={Icon ? <Icon className="text-muted-foreground size-4" /> : undefined}
      onMouseEnter={onHover}
      {...pressProps}
    >
      {block.label}
    </Row>
  );
}

/**
 * Presentational grouped list of block-type rows (icon + label). Section headers
 * are non-interactive eyebrows; only block rows are selectable, so the caller's
 * flat `activeIndex` runs over the SELECTABLE rows only (headers never consume an
 * index — the command-palette pattern). Flat callers pass one label-less section
 * (`[{ blocks }]`) → renders exactly as an ungrouped list.
 *
 * Two commit modes, mutually exclusive (the flat index is the commit key):
 *
 * - **`onCommit(index)`** — caret menus (slash / gutter-`+`). Rows commit on
 *   `onPointerDown` through the `useCaretMenu` `commit`, which is `pointerdown`-
 *   timed and `editor.update`-wrapped so a mouse click matches the keyboard.
 * - **`onSelect(block)`** — focused popover pickers (Add block / turn-into).
 *   Rows commit on `onMouseDown` + `preventDefault` to keep the picker's field
 *   focused.
 */
export function BlockTypeList({
  sections,
  activeIndex,
  onSelect,
  onCommit,
  onHoverIndex,
}: {
  sections: BlockSection[];
  activeIndex: number;
  onSelect?: (block: BlockHandle<unknown>) => void;
  onCommit?: (index: number) => void;
  onHoverIndex: (index: number) => void;
}) {
  const flatCount = sections.reduce((n, s) => n + s.blocks.length, 0);
  if (flatCount === 0) {
    return (
      <Text as="div" variant="body" className="text-muted-foreground px-sm py-xs">
        No block types
      </Text>
    );
  }

  // Running index over selectable rows only — headers are skipped, so the
  // caller's keyboard `activeIndex` (0-based over the flattened block list) maps
  // straight onto the rendered rows.
  let flatIdx = 0;
  return (
    <Stack gap="none">
      {sections.map((section, si) => (
        <div key={section.label ?? `__loose-${si}`}>
          {section.label ? (
            <Text
              as="div"
              variant="caption"
              className="text-muted-foreground px-sm pt-xs font-medium uppercase tracking-wide"
            >
              {section.label}
            </Text>
          ) : null}
          {section.blocks.map((block) => {
            const idx = flatIdx++;
            return (
              <BlockTypeRow
                key={block.type}
                block={block}
                active={idx === activeIndex}
                onSelect={onSelect}
                onCommit={onCommit ? () => onCommit(idx) : undefined}
                onHover={() => onHoverIndex(idx)}
              />
            );
          })}
        </div>
      ))}
    </Stack>
  );
}
