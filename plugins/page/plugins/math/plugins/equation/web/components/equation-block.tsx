import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useEffect, useRef } from "react";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  useBlockEditor,
  type BlockRendererProps,
} from "@plugins/page/plugins/editor/web";
import { textBlock } from "@plugins/page/plugins/text/core";
import { KatexMath } from "@plugins/page/plugins/math/plugins/render/web";
import { equationBlock } from "../../core";

// Shared mono metric for the LaTeX-source textarea.
const SOURCE_METRICS = "p-md font-mono text-xs leading-5";

/**
 * A block-level LaTeX equation. Like code-block, it owns its own textarea (outside
 * Lexical) and opts into the editor's focus system via a focus handle, so insertion
 * / `$$` conversion / arrow-key navigation can land on it.
 *
 * Display (not focused, non-empty): a centered KaTeX render, clickable to edit.
 * Empty + not focused: a muted placeholder. Editing (focused or empty): a panel
 * with a live KaTeX preview above a monospace textarea for the LaTeX source.
 */
export function EquationBlock({ block, isFocused, editor }: BlockRendererProps) {
  const { registerFocusHandle } = useBlockEditor();
  const parsed = equationBlock.parse(block.data);

  const field = useEditableField({
    value: parsed.expression,
    onSave: (next) => editor.update({ expression: next }),
  });
  const expression = field.value;

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Register a focus handle so convertTo / insertAfter / focusUp/Down can land here.
  useEffect(
    () =>
      registerFocusHandle(block.id, { focus: () => textareaRef.current?.focus() }),
    [block.id, registerFocusHandle],
  );

  // Pull the caret into the textarea when the editor considers this block focused
  // (e.g. right after a `$$` conversion keeps focusedBlockId on this id).
  useEffect(() => {
    const ta = textareaRef.current;
    if (isFocused && ta && document.activeElement !== ta) ta.focus();
  }, [isFocused]);

  // Editing whenever focused, or whenever empty (nothing to render yet).
  const editing = isFocused || expression === "";

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget;
    if (e.key === "Backspace" && expression === "") {
      // Empty equation → remove it, matching Notion's code/divider behavior.
      e.preventDefault();
      editor.remove();
      return;
    }
    if (e.key === "ArrowUp" && ta.selectionStart === 0 && ta.selectionEnd === 0) {
      e.preventDefault();
      editor.navigate("up");
      return;
    }
    if (
      e.key === "ArrowDown" &&
      ta.selectionStart === expression.length &&
      ta.selectionEnd === expression.length
    ) {
      e.preventDefault();
      editor.navigate("down");
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      // A single equation is one expression — Enter commits and continues typing
      // on a fresh text block below (Notion-like). Shift+Enter inserts a literal
      // newline into the source. The editor deliberately does not know the text
      // block (avoids an editor↔text cycle), so — like divider — we, a consumer
      // of both, construct the seed.
      e.preventDefault();
      editor.insertAfter(textBlock.type, textBlock.schema.parse({ text: [] }));
    }
  }

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
        <textarea
          ref={textareaRef}
          value={expression}
          onChange={(e) => field.onChange(e.target.value)}
          onFocus={() => {
            field.onFocus();
            editor.onFocus();
          }}
          onBlur={field.onBlur}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          placeholder="LaTeX source… e.g. E = mc^2"
          // eslint-disable-next-line layout/no-adhoc-layout -- textarea self-clip: suppresses the control's own scrollbar (fixed rows=2), not a wrappable box overflow
          className={cn(
            "border-border w-full resize-none overflow-hidden border-t bg-transparent",
            "caret-foreground outline-none placeholder:text-muted-foreground",
            SOURCE_METRICS,
          )}
          rows={2}
        />
      </Clip>
    </div>
  );
}
