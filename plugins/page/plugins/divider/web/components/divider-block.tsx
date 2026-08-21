import {
  VoidCaretBox,
  type BlockRendererProps,
} from "@plugins/page/plugins/editor/web";
import { textBlock } from "@plugins/page/plugins/text/core";

/**
 * A divider is a *void* block: it has no editable content, so unlike code /
 * equation (which own a textarea to hold the caret) there is nothing here for
 * the browser to put a caret in — the block itself has to be the focusable
 * thing, or the caret strands here after a `---` conversion and arrow-key
 * navigation skips over it.
 *
 * All of that — registering the focus handle, pulling DOM focus when the editor
 * says the caret is here, reporting focus back, painting the "the caret is on
 * this block" cue, and letting ↑/↓ leave — is the editor's, via
 * `VoidCaretBox`. What stays here is the divider's own keyboard *meaning*:
 * Backspace/Delete removes it, and Enter drops a fresh text block below to keep
 * typing.
 */
export function DividerBlock({ block, isFocused, editor }: BlockRendererProps) {
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      editor.navigate("up"); // land the caret on the block above…
      editor.remove(); // …then delete this divider
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Continue typing on a new line below. The editor deliberately does not
      // know the text block (avoids an editor↔text cycle), so — like
      // create-page-with-seed — we, a consumer of both, construct the seed.
      editor.insertAfter(textBlock.type, textBlock.schema.parse({ text: [] }));
    }
  }

  return (
    <VoidCaretBox
      blockId={block.id}
      isFocused={isFocused}
      editor={editor}
      label="Divider"
      onKeyDown={onKeyDown}
    >
      <hr className="border-border border-t" />
    </VoidCaretBox>
  );
}
