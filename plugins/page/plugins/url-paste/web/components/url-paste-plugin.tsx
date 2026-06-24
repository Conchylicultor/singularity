import { useEffect, useState } from "react";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ESCAPE_COMMAND,
  PASTE_COMMAND,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { MdBookmark, MdLink, MdSmartDisplay } from "react-icons/md";
import { FloatingSurface } from "@plugins/primitives/plugins/floating-surface/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { textOf } from "@plugins/page/plugins/editor/core";
import { caretAnchor, type BlockTextPluginProps } from "@plugins/page/plugins/editor/web";
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
  const [menu, setMenu] = useState<{ url: string } | null>(null);

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
        setMenu({ url });
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
    // Caret-anchored. A collapsed selection in an EMPTY block yields an all-zero
    // rect, so the anchor falls back to the block's editable element.
    <FloatingSurface
      open={!!menu}
      anchor={caretAnchor(() => lexical.getRootElement()?.getBoundingClientRect() ?? null)}
      width="sm"
      padding="xs"
      onDismiss={() => setMenu(null)}
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
    </FloatingSurface>
  );
}
