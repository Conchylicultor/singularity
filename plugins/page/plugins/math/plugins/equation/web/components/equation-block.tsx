import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  BlockTextArea,
  useBlockPlainText,
  type BlockRendererProps,
} from "@plugins/page/plugins/editor/web";
import { textBlock } from "@plugins/page/plugins/text/core";
import { KatexMath } from "@plugins/page/plugins/math/plugins/render/web";
import { equationBlock } from "../../core";
import { textVariantClass } from "@plugins/primitives/plugins/css/plugins/text/web";

// Shared mono metric for the LaTeX-source textarea.
const SOURCE_METRICS = cn("p-md", textVariantClass("code"));

/**
 * A block-level LaTeX equation. Like code-block, its text lives outside Lexical,
 * in the editor's shared plain-text surface (`useBlockPlainText`): the draft, the
 * synchronous undo entry per keystroke, the debounced row write, the focus-handle
 * registration (so insertion / `$$` conversion / arrow-key navigation can land
 * here) and the ↑/↓/Backspace boundary keys all come from there. It draws no "the
 * caret is here" cue: the textarea has a real blinking caret, which says it better
 * than any tint could.
 *
 * Display (not focused, non-empty): a centered KaTeX render, clickable to edit.
 * Empty + not focused: a muted placeholder. Editing (focused or empty): a panel
 * with a live KaTeX preview above a monospace textarea for the LaTeX source.
 */
export function EquationBlock({
  block,
  isFocused,
  editor,
}: BlockRendererProps) {
  const parsed = equationBlock.parse(block.data);

  const text = useBlockPlainText({
    blockId: block.id,
    isFocused,
    editor,
    value: parsed.expression,
    rowData: (expression) => ({ expression }),
    label: "equation source",
    onKeyDown: (e) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      // A single equation is one expression — Enter commits and continues typing
      // on a fresh text block below (Notion-like). Shift+Enter inserts a literal
      // newline into the source. The editor deliberately does not know the text
      // block (avoids an editor↔text cycle), so — like divider — we, a consumer
      // of both, construct the seed.
      e.preventDefault();
      editor.insertAfter(textBlock.type, textBlock.schema.parse({ text: [] }));
    },
  });
  const expression = text.value;

  // Editing whenever focused, or whenever empty (nothing to render yet).
  const editing = isFocused || expression === "";

  if (!editing) {
    // Collapsed display: centered render, click to re-edit.
    return (
      <div className="px-md py-xs">
        <button
          type="button"
          onClick={() => editor.onFocus()}
          aria-label="Edit equation"
          className="hover:bg-muted/50 w-full rounded-md px-md py-sm outline-none"
        >
          <Center axis="horizontal">
            <KatexMath expression={expression} display />
          </Center>
        </button>
      </div>
    );
  }

  return (
    <div className="px-md py-xs">
      <Clip className="rounded-md bg-muted">
        {/* Live preview above the source. Empty source shows a muted hint. */}
        <Center className="min-h-8 px-md py-sm">
          {expression === "" ? (
            <Text variant="caption" tone="muted">
              New equation
            </Text>
          ) : (
            <KatexMath expression={expression} display />
          )}
        </Center>
        <BlockTextArea
          text={text}
          placeholder="LaTeX source… e.g. E = mc^2"
          // eslint-disable-next-line layout/no-adhoc-layout -- textarea self-clip: suppresses the control's own scrollbar (fixed rows=2), not a wrappable box overflow
          className={cn(
            "border-border w-full resize-none overflow-hidden border-t bg-transparent",
            SOURCE_METRICS,
          )}
          rows={2}
        />
      </Clip>
    </div>
  );
}
