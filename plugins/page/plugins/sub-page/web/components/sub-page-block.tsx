import { useEffect, useRef } from "react";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { pageData } from "@plugins/page/plugins/editor/core";
import {
  PageIcon,
  useBlockEditor,
  type BlockRendererProps,
} from "@plugins/page/plugins/editor/web";

/**
 * A sub-page rendered inline in its parent's content flow: icon + title, click
 * to open. Its own content lives under a different `page_id`, so this row is a
 * LEAF of the forest the editor reduces over.
 *
 * It is a *void* block — it owns no editable content. Like the divider it
 * registers a focus handle so the editor's focus system can land on it
 * (`navigate()` skips blocks with no handle, and selection / drag read from the
 * same order). But it registers ONLY `focus`: no `truncateAt`, no
 * `appendRunsAtEnd`, no `focusOffset`. Those are the text-surgery seams a bound
 * text editor exposes, and their absence is what makes it structurally
 * impossible for Enter (split) or Backspace (merge) to ORIGINATE in a page row
 * — the hazard the reducer's guards then backstop.
 */
export function SubPageBlock({ block, isFocused, editor }: BlockRendererProps) {
  const { registerFocusHandle, onOpenPage } = useBlockEditor();
  const ref = useRef<HTMLElement>(null);
  const { title, iconSvgNodes } = pageData(block);

  useEffect(
    () => registerFocusHandle(block.id, { focus: () => ref.current?.focus() }),
    [block.id, registerFocusHandle],
  );

  // Pull focus to the row when the editor considers this block focused (e.g.
  // after an arrow-key navigation landed here).
  useEffect(() => {
    if (isFocused && ref.current && document.activeElement !== ref.current) {
      ref.current.focus();
    }
  }, [isFocused]);

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
        ref={ref}
        hover="muted"
        onClick={() => onOpenPage?.(block.id)}
        onKeyDown={onKeyDown}
        onFocus={() => editor.onFocus()}
        className={cn("outline-none", isFocused && "ring-primary/30 ring-1")}
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
