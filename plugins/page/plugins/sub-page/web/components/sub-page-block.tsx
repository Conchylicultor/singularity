import { useRef } from "react";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import {
  Row,
  type RowFocus,
} from "@plugins/primitives/plugins/css/plugins/row/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { pageData } from "@plugins/page/plugins/editor/core";
import {
  PageIcon,
  useVoidCaret,
  type BlockRendererProps,
} from "@plugins/page/plugins/editor/web";
import {
  usePageNavigation,
  usePageReferenceActions,
} from "@plugins/page/plugins/page-reference/web";

/**
 * A sub-page rendered inline in its parent's content flow: icon + title, click
 * to open. Its own content lives under a different `page_id`, so this row is a
 * LEAF of the forest the editor reduces over.
 *
 * It is a *void* block — it owns no editable content. Like every other void
 * block it goes through `useVoidCaret`, which registers a focus handle so the
 * editor's focus system can land on it (`navigate()` skips blocks with no
 * handle, and selection / drag read from the same order). That handle carries
 * ONLY `focus`: no `truncateAt`, no
 * `appendRunsAtEnd`, no `focusOffset`. Those are the text-surgery seams a bound
 * text editor exposes, and their absence is what makes it structurally
 * impossible for Enter (split) or Backspace (merge) to ORIGINATE in a page row
 * — the hazard the reducer's guards then backstop.
 */
export function SubPageBlock({ block, isFocused, editor }: BlockRendererProps) {
  const nav = usePageNavigation();
  // The row's own click opens in place; everything else the user can do with the
  // referenced page (open it beside this one, …) is a contributed action.
  const actions = usePageReferenceActions(block.id);
  // The capability to focus the row, never the row's node: `Row` synthesizes its
  // own control and moves it the moment the row carries `actions` (which this
  // one does), so there is no node here worth holding.
  const focusRef = useRef<RowFocus>(null);
  const { title, iconSvgNodes } = pageData(block);

  // The whole void-block caret plumbing — register the focus handle, pull DOM
  // focus when the editor says the caret is here, report focus back — is the
  // editor's, and it takes the row's focus *capability*, which is all this block
  // has to give. Only the cue is not the hook's here: `Row` already paints it
  // (see `selected` below), so this one does not reach for `VoidCaretBox`.
  const { onFocus } = useVoidCaret({
    blockId: block.id,
    isFocused,
    editor,
    focus: () => focusRef.current?.focus(),
  });

  // Arrows hand focus on to the neighbouring block, so the caret never strands
  // here. Enter/Space fall through to the row's native button activation (open
  // the page). Backspace is deliberately unhandled: removing a sub-page destroys
  // its whole content partition, so it stays an explicit menu action.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      editor.navigate("up");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      editor.navigate("down");
    }
  }

  return (
    <Inset x="md" y="xs">
      <Row
        focusRef={focusRef}
        // The editor's caret being on this block IS `Row`'s `selected` — this is
        // the current row. The bespoke ring that used to live here was a SECOND
        // focus indicator, drawn on the row box while the browser drew its own
        // on the inner control; `Row` now owns the focus ring, and this owns
        // "current". `hover="accent"` (the `Row` default) is not cosmetic: it is
        // what makes `selected` resolve to `bg-accent`, the exact tint
        // `VoidCaretBox` paints — so the two void arms, the row and the box, say
        // "the caret is here" in one voice.
        selected={isFocused}
        hover="accent"
        onClick={() => nav?.open(block.id)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        actions={actions}
        icon={
          <Center as="span" className="text-muted-foreground size-4">
            <PageIcon nodes={iconSvgNodes} className="size-4" />
          </Center>
        }
      >
        <Text className="font-medium underline-offset-2 hover:underline">
          {title || "Untitled"}
        </Text>
      </Row>
    </Inset>
  );
}
