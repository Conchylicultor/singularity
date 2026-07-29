import { useEffect, useState } from "react";
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, PASTE_COMMAND } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { MdBookmark, MdLink, MdSmartDisplay } from "react-icons/md";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import {
  CaretTriggerMenu,
  useCaretMenu,
  useForcedCaretQuery,
} from "@plugins/primitives/plugins/text-editor/plugins/caret-trigger/web";
import { textOf } from "@plugins/page/plugins/editor/core";
import { type BlockTextPluginProps } from "@plugins/page/plugins/editor/web";
import { BOOKMARK_TYPE } from "@plugins/page/plugins/bookmark/core";
import { EMBED_TYPE } from "@plugins/page/plugins/embed/core";

/** A bare http(s) URL is a single whitespace-free token that parses as a URL. */
function bareUrl(text: string): string | null {
  if (!text || /\s/.test(text)) return null;
  try {
    const u = new URL(text);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return text;
  } catch (err) {
    // `new URL` throws TypeError on non-URL text — the expected case; not a URL.
    if (!(err instanceof TypeError)) throw err;
    return null;
  }
}

const ITEMS = [
  { kind: "bookmark", icon: MdBookmark, label: "Create bookmark" },
  { kind: "embed", icon: MdSmartDisplay, label: "Create embed" },
  { kind: "link", icon: MdLink, label: "Plain link" },
] as const;

/**
 * Pasting a bare URL into an EMPTY text block offers Bookmark / Embed / Plain
 * link. A Plugin-only block-text extension (no inline node). On `PASTE_COMMAND`,
 * if the block is empty and the clipboard is a single bare URL, we
 * `preventDefault` and pop a compact 3-item menu at the caret; otherwise the
 * paste falls through (return false) and behaves normally.
 *
 * The menu is a full member of the caret-trigger primitive rather than a bespoke
 * surface. A paste is an EXTERNAL open signal — exactly what `useForcedCaretQuery`
 * (the same producer behind the gutter `+`) exists for — so `useCaretMenu` supplies
 * arrows / Enter / Esc / outside-press and the pointerdown-timed `commit`
 * identically to `/`, `[[`, `@` and `$$`. This file previously hand-rolled the
 * surface: it took the primitive's `caretAnchor` but none of its keyboard model,
 * so the menu was mouse-only.
 */
export function UrlPastePlugin({ block, editor }: BlockTextPluginProps) {
  const [lexical] = useLexicalComposerContext();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    return lexical.registerCommand<ClipboardEvent>(
      PASTE_COMMAND,
      (event) => {
        const pasted = bareUrl(event.clipboardData?.getData("text/plain")?.trim() ?? "");
        if (!pasted) return false;
        // Only hijack an EMPTY text block — otherwise paste normally so a URL
        // pasted into existing text just inserts.
        if (textOf(block).trim() !== "") return false;

        event.preventDefault();
        setUrl(pasted);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [lexical, block, editor]);

  // Externally-driven open-state: the paste event is the signal, so there is no
  // trigger char to derive from and no arbiter candidacy to resolve.
  const caret = useForcedCaretQuery({
    id: "url-paste",
    active: url !== null,
    onDismiss: () => setUrl(null),
  });

  const { surfaceOpen, activeIndex, setActiveIndex, commit } = useCaretMenu(caret, {
    itemCount: ITEMS.length,
    onCommit: (i) => {
      if (url === null) return;
      const kind = ITEMS[i]!.kind;
      if (kind === "bookmark") editor.convertTo(BOOKMARK_TYPE, { url });
      else if (kind === "embed") editor.convertTo(EMBED_TYPE, { url });
      else {
        // Nested update — deferred until the enclosing `commit` update settles,
        // which is what makes a pointer commit byte-for-byte the keyboard one.
        lexical.update(() => {
          const sel = $getSelection();
          if ($isRangeSelection(sel)) sel.insertText(url);
        });
      }
      setUrl(null);
    },
  });

  return (
    <CaretTriggerMenu caret={caret} open={surfaceOpen} width="sm" padding="xs">
      {/* eslint-disable-next-line data-view/no-adhoc-row-list -- Transient caret-menu
          chrome, not a collection of domain records: three fixed conversion choices
          whose index IS the keyboard commit key. Same shape as the `/` menu's rows. */}
      {ITEMS.map(({ kind, icon: Icon, label }, i) => (
        <Row
          key={kind}
          selected={activeIndex === i}
          icon={<Icon />}
          onMouseEnter={() => setActiveIndex(i)}
          // Commits on `pointerdown`, never `click`: the focus-less surface
          // perturbs the host selection and unmounts this row before a later
          // mouse event could fire (see `useCaretMenu`'s `commit`).
          onPointerDown={(e: React.PointerEvent) => {
            e.preventDefault();
            commit(i);
          }}
        >
          {label}
        </Row>
      ))}
    </CaretTriggerMenu>
  );
}
