import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useEffect, useRef } from "react";
import {
  BLOCK_INSET,
  useBlockEditor,
  type BlockRendererProps,
} from "@plugins/page/plugins/editor/web";
import { textBlock } from "@plugins/page/plugins/text/core";

/**
 * A divider is a *void* block: it has no editable content, so unlike code/image
 * (which own a textarea / upload picker to hold focus) it must opt into the
 * editor's focus system itself — otherwise the caret strands here after a `---`
 * conversion and arrow-key navigation skips over it.
 *
 * It registers a focus handle (so convertTo / insertAfter / focusUp / focusDown
 * can land on it) and handles its own keyboard nav: Backspace/Delete removes it,
 * ↑/↓ move to neighbours, and Enter drops a fresh text block below to keep typing.
 */
export function DividerBlock({ block, isFocused, editor }: BlockRendererProps) {
  const { registerFocusHandle } = useBlockEditor();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(
    () => registerFocusHandle(block.id, { focus: () => ref.current?.focus() }),
    [block.id, registerFocusHandle],
  );

  // Pull focus to the wrapper when the editor considers this block focused
  // (e.g. right after a `---` conversion keeps focusedBlockId on this id).
  useEffect(() => {
    if (isFocused && ref.current && document.activeElement !== ref.current) {
      ref.current.focus();
    }
  }, [isFocused]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      editor.navigate("up"); // land the caret on the block above…
      editor.remove(); // …then delete this divider
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      editor.navigate("up");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      editor.navigate("down");
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Continue typing on a new line below. The editor deliberately does not
      // know the text block (avoids an editor↔text cycle), so — like
      // create-page-with-seed — we, a consumer of both, construct the seed.
      editor.insertAfter(textBlock.type, textBlock.schema.parse({ text: [] }));
    }
  }

  return (
    <Inset
      x={BLOCK_INSET}
      y="sm"
      ref={ref}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={() => editor.onFocus()}
      aria-label="Divider"
      className={cn(
        "cursor-default outline-none",
        isFocused && "ring-primary/30 rounded-md ring-1",
      )}
    >
      <hr className="border-border border-t" />
    </Inset>
  );
}
