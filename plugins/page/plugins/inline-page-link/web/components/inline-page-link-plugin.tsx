import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  CaretTriggerMenu,
  useCaretMenu,
  useCaretQuery,
} from "@plugins/primitives/plugins/text-editor/plugins/caret-trigger/web";
import {
  usePageOptions,
  PageOptionsList,
  type BlockTextPluginProps,
  type PageOption,
} from "@plugins/page/plugins/editor/web";
import { $createPageLinkInlineNode } from "./page-link-inline-node";
import { createLinkedPage } from "../internal/create-linked-page";

/**
 * Inline, Notion-style `[[` page-mention typeahead, built on the shared
 * caret-trigger primitive: open-state + query are DERIVED from the live editor
 * text (never a latch — see the primitive's CLAUDE.md); arrows/Enter navigate,
 * Esc / outside-press dismiss. Since `[[` is mid-line the menu renders through
 * `CaretTriggerMenu`, caret-anchored.
 *
 * On select, the `[[query` is replaced with an inline page-link node (+ a trailing
 * space); for "Create '<query>'" a new page is created first. The node persists as
 * a `[[<pageId>]]` token via the block-text extension's serializer. Removing the
 * `[[query` text inside the same `update()` re-derives "no trigger", so the menu
 * closes by derivation — no explicit close.
 */
export function InlinePageLinkPlugin(_: BlockTextPluginProps) {
  const [lexicalEditor] = useLexicalComposerContext();

  function insertLink(pageId: string) {
    lexicalEditor.update(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel) || !sel.isCollapsed()) return;
      const node = sel.anchor.getNode();
      if (!$isTextNode(node)) return;
      const full = node.getTextContent();
      const caretOffset = sel.anchor.offset;
      const idx = full.slice(0, caretOffset).lastIndexOf("[[");
      if (idx === -1) return;
      const head = full.slice(0, idx);
      const tail = full.slice(caretOffset);
      node.setTextContent(head);
      const link = $createPageLinkInlineNode(pageId);
      const space = $createTextNode(" ");
      node.insertAfter(link);
      link.insertAfter(space);
      if (tail) space.insertAfter($createTextNode(tail));
      // Caret immediately after the inserted space.
      space.select(1, 1);
    });
  }

  function handleSelect(option: PageOption) {
    if (option.kind === "page") {
      insertLink(option.page.id);
    } else {
      void createLinkedPage(option.title).then((id) => insertLink(id));
    }
  }

  const caret = useCaretQuery({
    id: "page-link",
    trigger: "[[",
    isQueryValid: (q) => !/[[\]\n]/.test(q),
  });

  const pageOptionsResult = usePageOptions(caret.query, { allowCreate: true });
  // Settled options drive keyboard nav; [] while pending is safe — itemCount is
  // 0 (not interactive) then, and the menu shows a spinner, not "No pages found".
  const options = pageOptionsResult.pending ? [] : pageOptionsResult.options;

  const { surfaceOpen, activeIndex, setActiveIndex } = useCaretMenu(caret, {
    itemCount: options.length,
    onCommit: (i) => handleSelect(options[i]!),
  });

  return (
    <CaretTriggerMenu
      caret={caret}
      open={surfaceOpen}
      width="lg"
      padding="xs"
      maxHeight="md"
    >
      {pageOptionsResult.pending ? (
        <Loading variant="rows" />
      ) : (
        <PageOptionsList
          options={pageOptionsResult.options}
          activeIndex={activeIndex}
          onSelect={(id) => insertLink(id)}
          onCreate={(title) => void createLinkedPage(title).then((id) => insertLink(id))}
          onHoverIndex={setActiveIndex}
        />
      )}
    </CaretTriggerMenu>
  );
}
