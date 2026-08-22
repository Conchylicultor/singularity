import { BLOCK_INSET } from "@plugins/page/plugins/editor/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";

/**
 * A horizontal rule, and nothing else.
 *
 * The divider is the purest *void* block: no editable text, no control of its
 * own, nothing for the browser to put a caret in. It declares `caret: "editor"`,
 * so the editor wraps this renderer in its caret host — which is focusable,
 * paints the "the caret is on this block" cue, lets ↑/↓ leave, and answers
 * Backspace (delete the block) and Enter (a fresh paragraph below).
 *
 * So this file owns **no caret code at all**, and that is the point rather than
 * a consequence of the block being simple: the Backspace and Enter it used to
 * hand-write ARE the editor's meanings for every void block — one spelling here,
 * a slightly different one in each of the others, and eight block types with
 * none. Declaring where the caret lives is now the whole of a divider's
 * participation in the caret model.
 */
export function DividerBlock() {
  return (
    <Inset x={BLOCK_INSET} y="sm">
      <hr className="border-border border-t" />
    </Inset>
  );
}
