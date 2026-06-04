import { useMemo } from "react";
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
export function BlockTextRenderer({ block, isFocused, editor }: BlockRendererProps) {
  const contributions = Editor.Block.useContributions();
  const handle = useMemo(
    () => contributions.find((c) => c.block.type === block.type)?.block,
    [contributions, block.type],
  );

  const marker = handle?.marker ? (
    <span
      aria-hidden
      className="text-muted-foreground flex-none select-none py-1 pl-3 pr-1 text-sm leading-6"
    >
      {handle.marker}
    </span>
  ) : undefined;

  return (
    <BlockTextEditor
      block={block}
      isFocused={isFocused}
      editor={editor}
      marker={marker}
      placeholder={handle?.placeholder}
    />
  );
}
