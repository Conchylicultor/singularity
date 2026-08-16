import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  blocksResource,
  inDocumentOrder,
  plainOf,
  toNodes,
  type Block,
  type BlockHandle,
} from "@plugins/page/plugins/editor/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { OutlineRail } from "@plugins/primitives/plugins/outline/plugins/rail/web";

/** Stable empty value, so a pending read never re-renders on a fresh `[]`. */
const NO_BLOCKS: Block[] = [];

/** A block type that declares itself a heading, plus the handle that reads its text. */
interface HeadingType {
  level: number;
  handle: BlockHandle<unknown>;
}

/**
 * Block type → its heading level, read off each type's OWN declared
 * `handle.semantics` (`{ role: "heading", level }`).
 *
 * This plugin therefore names no block type. A `heading-4` plugin registered
 * tomorrow appears in the outline with zero edits here — and, just as important,
 * a big-but-not-heading block type never does, because "renders large"
 * (`textVariant`) and "is a heading" (`semantics`) are separate declarations in
 * the editor's block API and only one of them is a claim about structure.
 */
function useHeadingTypes(): ReadonlyMap<string, HeadingType> {
  const contributions = Editor.Block.useContributions();
  return useMemo(() => {
    const out = new Map<string, HeadingType>();
    for (const c of contributions) {
      const semantics = c.block.semantics;
      // A non-string `match` (RegExp / predicate) claims no single type id, so
      // there is no key to file it under — same rule `useFramedBlockTypes` uses.
      if (typeof c.match !== "string" || semantics?.role !== "heading")
        continue;
      out.set(c.match, { level: semantics.level, handle: c.block });
    }
    return out;
  }, [contributions]);
}

/**
 * The heading's row in the live editor, or `null` when it is not on screen —
 * a heading inside a collapsed toggle is in the outline (it is in the document)
 * but has no DOM row, and the rail reads `null` as exactly that.
 *
 * `data-block-id` is stamped on every `BlockRow` and is already the editor's own
 * handle on a row (`rowAtPointer`, the drag/marquee geometry), so this borrows a
 * convention rather than introducing one.
 *
 * Known bound: the query is document-wide. Block ids are unique, so two panes
 * showing two DIFFERENT pages can never collide; two panes showing the SAME page
 * (or a page open beside a parent that embeds it as an expanded sub-page) both
 * resolve to whichever row is first in the DOM.
 */
function resolveBlockRow(id: string): Element | null {
  return document.querySelector(`[data-block-id="${CSS.escape(id)}"]`);
}

/**
 * The open page's headings, as the outline rail pinned to the right edge of the
 * pane. Mounted through `PageDetail.Overlay`.
 */
export function PageOutline({ pageId }: { pageId: string }) {
  const headingTypes = useHeadingTypes();
  const result = useResource(blocksResource, { pageId });
  const blocks = result.pending ? (result.stale ?? NO_BLOCKS) : result.data;

  const entries = useMemo(() => {
    const headings = new Map<string, Block>();
    for (const b of blocks) if (headingTypes.has(b.type)) headings.set(b.id, b);
    // `inDocumentOrder`, NOT `flattenVisible`: the outline is a map of the
    // DOCUMENT, so a heading nested inside a collapsed toggle still belongs in
    // it. (It resolves to no element until the toggle is opened — see
    // `resolveBlockRow`.)
    const out: { id: string; label: string; depth: number }[] = [];
    for (const id of inDocumentOrder(toNodes(blocks), [...headings.keys()])) {
      const block = headings.get(id)!;
      const heading = headingTypes.get(block.type)!;
      // The handle's own text lens, never `data.text` read by hand — the lens is
      // typed against the block's own payload, so a field rename is a compile
      // error in the block's plugin instead of a silently blank outline row.
      const label = plainOf(heading.handle.text?.(block.data)).trim();
      // An empty heading names nothing, so it is not an entry.
      if (label === "") continue;
      out.push({ id, label, depth: Math.max(0, heading.level - 1) });
    }
    return out;
  }, [blocks, headingTypes]);

  return (
    <OutlineRail
      entries={entries}
      resolve={resolveBlockRow}
      label="Page outline"
    />
  );
}
