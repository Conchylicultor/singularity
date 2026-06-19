import { useMemo, type ReactNode } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { BlockRendererProps } from "../types";
import { Editor } from "../slots";
import { BlockTextEditor } from "./block-text-editor";

/**
 * The single renderer shared by every editable-text block type (text,
 * bulleted-list, …). Because all such types register *this same function* as
 * their dispatch component, converting one into another (e.g. `* ` → bullet)
 * reconciles in place — the live Lexical editor instance, its focus and its
 * caret all survive, so no keystrokes are lost across the conversion.
 *
 * Per-type presentation (the leading marker, the placeholder) is read from the
 * matched block handle, so this renderer never names a specific block type.
 */
export function BlockTextRenderer({ block, isFocused, editor, ordinal }: BlockRendererProps) {
  const contributions = Editor.Block.useContributions();
  const handle = useMemo(
    () => contributions.find((c) => c.block.type === block.type)?.block,
    [contributions, block.type],
  );

  // A boolean-state block (e.g. to-do): the static glyph is replaced by an
  // interactive checkbox bound to `data[field]`, and the text is struck through
  // when set. Read generically from the handle — never naming a block type.
  const data = block.data as Record<string, unknown>;
  const checked = handle?.toggle ? Boolean(data[handle.toggle.field]) : false;

  let marker: ReactNode;
  if (handle?.toggle) {
    marker = (
      <input
        type="checkbox"
        checked={checked}
        onChange={() =>
          editor.update({ ...data, [handle.toggle!.field]: !checked })
        }
        // Don't blur the editor before the onChange registers; the editable
        // field flushes on blur anyway, but this keeps the caret put.
        onMouseDown={(e) => e.preventDefault()}
        // eslint-disable-next-line spacing/no-adhoc-spacing, layout/no-adhoc-layout -- mt-2 is a one-off vertical offset seating the checkbox glyph on the first text line (horizontal placement owned by the shared marker gutter); self-start is a per-child cross-axis align onto the gutter's top, not expressible via the parent
        className="accent-primary mt-2 size-3.5 cursor-pointer self-start"
      />
    );
  } else if (handle?.ordinalMarker) {
    marker = (
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
    marker = (
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

  return (
    <BlockTextEditor
      block={block}
      isFocused={isFocused}
      editor={editor}
      marker={marker}
      placeholder={handle?.placeholder}
      contentClassName={contentClassName}
      textVariant={handle?.textVariant ?? "body"}
    />
  );
}
