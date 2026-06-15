import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ESCAPE_COMMAND,
  PASTE_COMMAND,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { MdBookmark, MdLink, MdSmartDisplay } from "react-icons/md";
import { ViewportOverlay } from "@plugins/primitives/plugins/viewport-overlay/web";
import { Surface } from "@plugins/primitives/plugins/surface/web";
import { Row } from "@plugins/primitives/plugins/row/web";
import { textOf } from "@plugins/page/plugins/editor/core";
import type { BlockTextPluginProps } from "@plugins/page/plugins/editor/web";
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

/**
 * Pasting a bare URL into an EMPTY text block offers Bookmark / Embed / Plain
 * link. A Plugin-only block-text extension (no inline node). On `PASTE_COMMAND`,
 * if the block is empty and the clipboard is a single bare URL, we
 * `preventDefault` and pop a compact 3-item menu at the caret; otherwise the
 * paste falls through (return false) and behaves normally.
 */
export function UrlPastePlugin({ block, editor }: BlockTextPluginProps) {
  const [lexical] = useLexicalComposerContext();
  const [menu, setMenu] = useState<{ url: string; left: number; top: number } | null>(
    null,
  );

  useEffect(() => {
    return lexical.registerCommand<ClipboardEvent>(
      PASTE_COMMAND,
      (event) => {
        const url = bareUrl(event.clipboardData?.getData("text/plain")?.trim() ?? "");
        if (!url) return false;
        // Only hijack an EMPTY text block — otherwise paste normally so a URL
        // pasted into existing text just inserts.
        if (textOf(block).trim() !== "") return false;

        event.preventDefault();
        // Anchor the menu at the caret. A collapsed selection in an EMPTY block
        // yields an all-zero rect, so fall back to the block's editable element.
        const sel = window.getSelection();
        const caret = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
        const anchor =
          caret && (caret.width || caret.height || caret.left || caret.top)
            ? caret
            : lexical.getRootElement()?.getBoundingClientRect();
        setMenu({ url, left: anchor?.left ?? 0, top: anchor?.bottom ?? 0 });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [lexical, block, editor]);

  // Esc closes the menu (and does nothing else).
  useEffect(() => {
    return lexical.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        if (!menu) return false;
        setMenu(null);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [lexical, menu]);

  if (!menu) return null;

  const { url } = menu;

  function insertPlainLink() {
    lexical.update(() => {
      const sel = $getSelection();
      if ($isRangeSelection(sel)) sel.insertText(url);
    });
    setMenu(null);
  }

  return (
    // The overlay root is the outside-click backdrop (closes the menu); it
    // self-portals to document.body so the caret-anchored Surface is positioned
    // against the real viewport, never a transformed editor ancestor.
    <ViewportOverlay
      layer="popover"
      onMouseDown={(e: ReactMouseEvent) => {
        e.preventDefault();
        setMenu(null);
      }}
    >
      <Surface
        level="overlay"
        className="fixed w-56 p-xs"
        style={{ left: menu.left, top: menu.top + 4 }}
        // Keep clicks inside the menu from reaching the backdrop (which closes).
        onMouseDown={(e: ReactMouseEvent) => e.stopPropagation()}
      >
        <Row icon={<MdBookmark />} onClick={() => editor.convertTo(BOOKMARK_TYPE, { url })}>
          Create bookmark
        </Row>
        <Row icon={<MdSmartDisplay />} onClick={() => editor.convertTo(EMBED_TYPE, { url })}>
          Create embed
        </Row>
        <Row icon={<MdLink />} onClick={insertPlainLink}>
          Plain link
        </Row>
      </Surface>
    </ViewportOverlay>
  );
}
