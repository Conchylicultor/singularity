import { useEffect, useState } from "react";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  DROP_COMMAND,
  PASTE_COMMAND,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { MdBookmark, MdLink, MdSmartDisplay } from "react-icons/md";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import {
  CaretTriggerMenu,
  useCaretMenu,
  useForcedCaretQuery,
} from "@plugins/primitives/plugins/text-editor/plugins/caret-trigger/web";
import { textOf } from "@plugins/page/plugins/editor/core";
import {
  readTransferText,
  type BlockTextPluginProps,
} from "@plugins/page/plugins/editor/web";
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
 * Pasting — or DROPPING — a bare URL into an EMPTY text block offers Bookmark /
 * Embed / Plain link. A Plugin-only block-text extension (no inline node). On
 * `PASTE_COMMAND` / `DROP_COMMAND`, if the block is empty and the transfer is a
 * single bare URL, we `preventDefault` and pop a compact 3-item menu at the
 * caret; otherwise the gesture falls through (return false) and behaves
 * normally.
 *
 * The two gestures ask the same question, so they share one gate (`claim`) — a
 * link dragged out of another tab is the same intent as one pasted from it, and
 * a URL is exactly the payload a drag most often carries. It cannot collide with
 * the container's own drop door: a single-line URL over a block's editing host
 * classifies as `inline` there, so the container declines it, and this native
 * listener on the contenteditable runs before the container's React handler
 * anyway.
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
    /**
     * The shared gate: the URL this transfer carries, or null when the gesture
     * is not ours. `readTransferText` rather than a bare `text/plain` read —
     * some sources describe a dragged link ONLY as `text/uri-list`, which is the
     * whole payload here.
     */
    const claim = (data: DataTransfer | null, event: Event): string | null => {
      const url = bareUrl(data ? readTransferText(data).trim() : "");
      if (!url) return null;
      // Only hijack an EMPTY text block — otherwise the gesture behaves normally
      // so a URL landing in existing text just inserts.
      if (textOf(block).trim() !== "") return null;
      event.preventDefault();
      return url;
    };

    const unregister = [
      lexical.registerCommand<ClipboardEvent>(
        PASTE_COMMAND,
        (event) => {
          const url = claim(event.clipboardData, event);
          if (url === null) return false;
          setUrl(url);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      lexical.registerCommand<DragEvent>(
        DROP_COMMAND,
        (event) => {
          const url = claim(event.dataTransfer, event);
          if (url === null) return false;
          // CONSUME the gesture, don't merely claim it. The block editor's
          // container has a drop door of its own ABOVE this one (React's
          // root-delegated `onDrop`), and it classifies the RAW transfer text —
          // which for a `text/uri-list` ends in the CRLF RFC 2483 mandates. So
          // the one payload a link drag most often carries reads as MULTI-LINE
          // up there, and a single dropped URL would open this menu AND mint a
          // block of its own. `stopPropagation` is the browser's own answer to
          // "a handler nearer the caret owns this gesture": React's listener
          // sits at the app root, so the event never reaches it.
          //
          // Only the DROP arm needs it. A caret paste never reaches the
          // container's `onPaste` — that one gates on the CONTAINER holding
          // focus (block-selection mode), which a caret in a block excludes by
          // construction. A drop has no such gate, and correctly so: a drop need
          // not focus anything.
          event.stopPropagation();
          // A paste implies focus; a DROP does not — the caret may be in another
          // block, or nowhere. `useForcedCaretQuery` gates `open` on DOM focus
          // living inside this editor's root, so seat it here. Lexical's
          // `focus()` places the caret (`root.selectStart()` on a
          // selection-less editor) and the reconciler writing that selection is
          // what takes DOM focus — `lexical@0.44.0 Lexical.dev.mjs:11259-11292`.
          // KNOWN BOUND: it is a no-op on a root with NO children, i.e. a block
          // whose content doc has not hydrated yet, where the menu then never
          // opens. Bounded to the mount gap of a block the user is dragging over.
          lexical.focus();
          setUrl(url);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    ];
    return () => {
      for (const u of unregister) u();
    };
  }, [lexical, block]);

  // Externally-driven open-state: the paste event is the signal, so there is no
  // trigger char to derive from and no arbiter candidacy to resolve.
  const caret = useForcedCaretQuery({
    id: "url-paste",
    active: url !== null,
    onDismiss: () => setUrl(null),
  });

  const { surfaceOpen, activeIndex, setActiveIndex, commit } = useCaretMenu(
    caret,
    {
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
    },
  );

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
