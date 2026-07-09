import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  CaretTriggerMenu,
  useCaretMenu,
  useCaretQuery,
} from "@plugins/primitives/plugins/text-editor/plugins/caret-trigger/web";
import { type BlockTextPluginProps } from "@plugins/page/plugins/editor/web";
import { KatexMath } from "@plugins/page/plugins/math/plugins/render/web";
import { $createInlineMathNode } from "./inline-math-node";

const TRIGGER = "$$";

/**
 * Inline, Notion-style `$$` math typeahead, built on the shared caret-trigger
 * primitive: open-state + query are DERIVED from the live editor text (never a
 * latch — see the primitive's CLAUDE.md). Unlike the list menus there is no
 * option list — math is freeform LaTeX, so the surface shows a single live KaTeX
 * preview of the query. `navigate: false` leaves the arrow keys to the editor so
 * the caret still moves through the LaTeX.
 *
 * On commit, the `$$<query>` is replaced with an inline math node (+ a trailing
 * space) inside the same `update()`, so the next listener tick re-derives "no
 * trigger" and the surface closes by derivation — no explicit close. The node
 * persists as a `\(<latex>\)` token via the block-text extension's serializer.
 */
export function InlineMathPlugin(_: BlockTextPluginProps) {
  const [lexicalEditor] = useLexicalComposerContext();

  const caret = useCaretQuery({
    id: "math",
    trigger: TRIGGER,
    // A `$$` at absolute offset 0 of the block's first text node is the block-
    // equation markdown shortcut — defer to it; only mid-line `$$` is inline math.
    canOpen: (ctx) => !(ctx.triggerIndex === 0 && ctx.node.getPreviousSibling() === null),
    isQueryValid: (q) => !/[$\n]/.test(q),
  });

  function commit(value: string) {
    lexicalEditor.update(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel) || !sel.isCollapsed()) return;
      const node = sel.anchor.getNode();
      if (!$isTextNode(node)) return;
      const full = node.getTextContent();
      const caretOffset = sel.anchor.offset;
      const idx = full.slice(0, caretOffset).lastIndexOf(TRIGGER);
      if (idx === -1) return;
      const head = full.slice(0, idx);
      const tail = full.slice(caretOffset);
      node.setTextContent(head);
      const math = $createInlineMathNode(value);
      const space = $createTextNode(" ");
      node.insertAfter(math);
      math.insertAfter(space);
      if (tail) space.insertAfter($createTextNode(tail));
      // Caret immediately after the inserted space.
      space.select(1, 1);
    });
  }

  const { surfaceOpen } = useCaretMenu(caret, {
    itemCount: caret.query === "" ? 0 : 1,
    onCommit: () => commit(caret.query),
    navigate: false,
  });

  return (
    <CaretTriggerMenu
      caret={caret}
      open={surfaceOpen}
      width="lg"
      padding="sm"
    >
      <Stack gap="sm">
        <Center className="min-h-6">
          {caret.query === "" ? (
            <Text variant="caption" tone="muted">
              Type a LaTeX expression…
            </Text>
          ) : (
            <KatexMath expression={caret.query} display={false} />
          )}
        </Center>
        <Text variant="caption" tone="muted">
          ↵ to insert
        </Text>
      </Stack>
    </CaretTriggerMenu>
  );
}
