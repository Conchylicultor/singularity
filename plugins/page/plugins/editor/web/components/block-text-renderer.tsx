import { useMemo, type ReactNode } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { rowDataOf } from "../../core";
import type { BlockRegionProps, BlockRendererProps } from "../types";
import { Editor } from "../slots";
import { BlockTextEditor } from "./block-text-editor";
import { TextBlockLayout } from "./text-block-layout";

/**
 * The single renderer shared by EVERY editable-text block type. Because all such
 * types dispatch *this same function* — `Editor.Block`'s union makes naming a
 * `component` a compile error for them — converting one into another (`* ` →
 * bullet, `/quote`, `/prompt`) reconciles in place: the live Lexical instance,
 * its Yjs binding, its focus and the caret all survive.
 *
 * It names no block type. Per-type presentation comes from two generic sources:
 * the matched handle's marker ladder + placeholder + typography, and the
 * contribution's `chrome` (box styling and the four sibling regions), which
 * `TextBlockLayout` applies onto a fixed element tree.
 */
export function BlockTextRenderer({ block, isFocused, editor, ordinal }: BlockRendererProps) {
  const contributions = Editor.Block.useContributions();
  const contribution = useMemo(
    () => contributions.find((c) => c.block.type === block.type),
    [contributions, block.type],
  );
  const handle = contribution?.block;

  // A boolean-state block (e.g. to-do): the static glyph is replaced by an
  // interactive checkbox bound to `data[field]`, and the text is struck through
  // when set. Read generically from the handle — never naming a block type.
  const data = block.data as Record<string, unknown>;
  const checked = handle?.toggle ? Boolean(data[handle.toggle.field]) : false;

  // The handle's marker ladder — the FALLBACK glyph, used unless the type
  // declares a `regions.start` of its own.
  let fallbackMarker: ReactNode;
  if (handle?.toggle) {
    fallbackMarker = (
      <input
        type="checkbox"
        checked={checked}
        onChange={() =>
          // `update` REPLACES the blob, so restate the block's other fields —
          // but through `rowDataOf`, never a raw `{...data}` spread: the row's
          // `text` is a ≤1 s-lagged projection of the content doc, and writing
          // that snapshot back would revert whatever was typed in the last
          // second. (`update` carries the projection across itself; see
          // `preserveText`.)
          editor.update({ ...rowDataOf(data), [handle.toggle!.field]: !checked })
        }
        // Don't blur the editor before the onChange registers; the editable
        // field flushes on blur anyway, but this keeps the caret put.
        onMouseDown={(e) => e.preventDefault()}
        // eslint-disable-next-line spacing/no-adhoc-spacing, layout/no-adhoc-layout -- mt-2 is a one-off vertical offset seating the checkbox glyph on the first text line (horizontal placement owned by the shared marker gutter); self-start is a per-child cross-axis align onto the gutter's top, not expressible via the parent
        className="accent-primary mt-2 size-3.5 cursor-pointer self-start"
      />
    );
  } else if (handle?.ordinalMarker) {
    fallbackMarker = (
      <Text
        as="span"
        variant="body"
        aria-hidden
        className="text-muted-foreground tabular-nums py-xs"
      >
        {handle.ordinalMarker(ordinal)}
      </Text>
    );
  } else if (handle?.marker) {
    fallbackMarker = (
      <Text
        as="span"
        variant="body"
        aria-hidden
        className="text-muted-foreground py-xs"
      >
        {handle.marker}
      </Text>
    );
  }

  const contentClassName =
    handle?.toggle && checked
      ? (handle.toggle.doneClassName ?? "line-through text-muted-foreground")
      : undefined;

  const region: BlockRegionProps = {
    id: block.id,
    type: block.type,
    pageId: block.pageId,
    data: block.data,
    isFocused,
    ordinal,
    editor,
  };

  return (
    <TextBlockLayout
      chrome={contribution?.chrome}
      region={region}
      fallbackMarker={fallbackMarker}
    >
      <BlockTextEditor
        block={block}
        isFocused={isFocused}
        editor={editor}
        placeholder={handle?.placeholder}
        contentClassName={contentClassName}
        textVariant={handle?.textVariant ?? "body"}
      />
    </TextBlockLayout>
  );
}
