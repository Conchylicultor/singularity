import { useMemo } from "react";
import { MdCalendarToday, MdNotificationsActive } from "react-icons/md";
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  atWordBoundary,
  CaretTriggerMenu,
  useCaretMenu,
  useCaretQuery,
} from "@plugins/primitives/plugins/text-editor/plugins/caret-trigger/web";
import { type BlockTextPluginProps } from "@plugins/page/plugins/editor/web";
import { $createDateMentionNode } from "./date-mention-node";
import { buildMenu, type DateOption } from "../internal/date-options";

/**
 * Inline, Notion-style `@` date/reminder typeahead, built on the shared
 * caret-trigger primitive: open-state + query are DERIVED from the live editor
 * text (never a latch — see the primitive's CLAUDE.md); arrows/Enter navigate,
 * Esc / outside-press dismiss; the menu renders through `CaretTriggerMenu`,
 * caret-anchored since `@` appears mid-line.
 *
 * The query is parsed by chrono into a concrete instant. Selecting the "date" row
 * inserts a `[[date:<iso>]]` chip; the "reminder" row mints a UUID and inserts a
 * `[[reminder:<id>:<iso>]]` chip that the server schedules a notification for.
 */
export function InlineDatePlugin(_: BlockTextPluginProps) {
  const [lexicalEditor] = useLexicalComposerContext();

  function insertMention(option: DateOption) {
    const iso = option.date.toISOString();
    const reminderId = option.kind === "reminder" ? crypto.randomUUID() : null;
    lexicalEditor.update(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel) || !sel.isCollapsed()) return;
      const node = sel.anchor.getNode();
      if (!$isTextNode(node)) return;
      const full = node.getTextContent();
      const caretOffset = sel.anchor.offset;
      const idx = full.slice(0, caretOffset).lastIndexOf("@");
      if (idx === -1) return;
      const head = full.slice(0, idx);
      const tail = full.slice(caretOffset);
      node.setTextContent(head);
      const mention = $createDateMentionNode(iso, reminderId);
      const space = $createTextNode(" ");
      node.insertAfter(mention);
      mention.insertAfter(space);
      if (tail) space.insertAfter($createTextNode(tail));
      // Caret immediately after the inserted space.
      space.select(1, 1);
    });
  }

  const caret = useCaretQuery({
    id: "date",
    trigger: "@",
    canOpen: atWordBoundary,
    isQueryValid: (q) => !/[@\n]/.test(q) && buildMenu(q, new Date()).open,
  });

  // `buildMenu` runs here for RENDER (hint vs. options) and again inside
  // `isQueryValid` for the OPEN gate — the same double evaluation the old
  // sync()+render performed; the model is deliberately not threaded through the hook.
  const menu = useMemo(() => buildMenu(caret.query, new Date()), [caret.query]);
  const options = menu.options;

  const { surfaceOpen, activeIndex, setActiveIndex, commit } = useCaretMenu(caret, {
    itemCount: options.length,
    onCommit: (i) => insertMention(options[i]!),
  });

  return (
    <CaretTriggerMenu
      caret={caret}
      open={surfaceOpen}
      width="lg"
      padding="xs"
    >
      {menu.hint ? (
        <Text as="div" variant="body" className="text-muted-foreground px-sm py-xs">
          Keep typing a date…
        </Text>
      ) : (
        <Stack gap="none">
          {options.map((option, i) => (
            <Row
              key={`${option.kind}-${i}`}
              selected={i === activeIndex}
              icon={
                option.kind === "reminder" ? (
                  <MdNotificationsActive className="text-muted-foreground" />
                ) : (
                  <MdCalendarToday className="text-muted-foreground" />
                )
              }
              onMouseEnter={() => setActiveIndex(i)}
              // Commit on pointerdown through the menu's `commit` (pointerdown-
              // timed + `editor.update`-wrapped), so a click matches Enter — a
              // mousedown-time commit would never fire (the press perturbs the
              // caret and unmounts this row first). See `useCaretMenu`.
              onPointerDown={(e: React.PointerEvent) => {
                e.preventDefault();
                commit(i);
              }}
            >
              <span className="truncate">{option.label}</span>
            </Row>
          ))}
        </Stack>
      )}
    </CaretTriggerMenu>
  );
}
