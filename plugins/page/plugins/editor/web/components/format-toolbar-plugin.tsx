import { useCallback, useEffect, useRef, useState } from "react";
import {
  $getSelection,
  $isRangeSelection,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from "lexical";
import { $getSelectionStyleValueForProperty } from "@lexical/selection";
import { $isLinkNode } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ViewportOverlay } from "@plugins/primitives/plugins/css/plugins/viewport-overlay/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { MARK_ORDER, type ColorToken, type Mark } from "../../core";
import { Editor } from "../slots";
import { FormatToolbarProvider, type FormatToolbarValue } from "../internal/format-toolbar-context";

/** Empty (all-false) mark snapshot, used as the closed default. */
function emptyActive(): Record<Mark, boolean> {
  const out = {} as Record<Mark, boolean>;
  for (const m of MARK_ORDER) out[m] = false;
  return out;
}

/**
 * The href the current range selection sits within, or `null`. Walks up from the
 * selection's anchor node — a selection is "in a link" when its anchor is inside
 * a `LinkNode`. Must run inside an `editorState.read`.
 */
function selectionLink(): string | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  // Walking the anchor's ancestors is the standard "am I inside a link" probe.
  let cur: ReturnType<typeof selection.anchor.getNode> | null =
    selection.anchor.getNode();
  for (; cur; cur = cur.getParent()) {
    if ($isLinkNode(cur)) return cur.getURL();
  }
  return null;
}

/**
 * The color token applied uniformly across the selection, or `null` when it has
 * no color or mixes several. Reads the CSS `color` style off the selection and
 * maps `var(--rt-color-<token>)` back to its token. Must run inside a
 * `editorState.read`.
 */
function selectionColor(): ColorToken | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  // `$getSelectionStyleValueForProperty` returns "" when the value is not uniform
  // across the selection, which we treat as "no single color".
  const value = $getSelectionStyleValueForProperty(selection, "color", "");
  const match = /var\(--rt-color-([a-z]+)\)/.exec(value);
  return match ? (match[1] as ColorToken) : null;
}

/** On-screen position of the floating bar (viewport coordinates). */
interface BarPosition {
  /** Left edge in px (already clamped to the viewport). */
  left: number;
  /** Top edge in px (above the selection rect). */
  top: number;
}

/** Vertical gap between the selection's top and the bar's bottom. */
const BAR_GAP = 8;
/** Horizontal viewport inset the bar is clamped to. */
const VIEWPORT_INSET = 8;
/** Estimated bar width used for initial horizontal clamping before measure. */
const BAR_EST_WIDTH = 200;

/**
 * Floating selection format toolbar host. Mounted inside every block composer.
 *
 * Selection tracking: a single update + SELECTION_CHANGE listener owns the
 * snapshot — when THIS editor holds a non-collapsed `RangeSelection`, it computes
 * `active` via `selection.hasFormat(mark)` for the closed Mark set and the bar's
 * screen position from the DOM range's bounding rect. The bar hides when the
 * selection collapses, lands in another editor, or the editor blurs.
 *
 * Positioning: the bar is portaled through `ViewportOverlay` (so `fixed` resolves
 * against the real viewport, never a transformed ancestor) above the selection,
 * horizontally clamped into view. The overlay root is `pointer-events-none` so it
 * never blocks clicks elsewhere; only the bar itself is interactive.
 *
 * No flicker / no focus steal: position+visibility update synchronously on
 * selection change (no async layout), and the bar's pointer-events are isolated
 * to its own box. Buttons preventDefault on mousedown (see `MarkButton`) so the
 * text selection survives a click.
 */
export function FormatToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState<Record<Mark, boolean>>(emptyActive);
  const [link, setLink] = useState<string | null>(null);
  const [color, setColor] = useState<ColorToken | null>(null);
  const [position, setPosition] = useState<BarPosition>({ left: 0, top: 0 });
  const barRef = useRef<HTMLElement>(null);
  // While a control's popover is open it pins the bar visible so blurring the
  // editor into the popover input doesn't collapse the selection and tear the
  // bar down. Held in a ref (read by listeners) mirrored to state (gates render).
  const pinnedRef = useRef(false);
  const [pinned, setPinnedState] = useState(false);
  const setPinned = useCallback((next: boolean) => {
    pinnedRef.current = next;
    setPinnedState(next);
  }, []);

  const update = useCallback(() => {
    // Pinned: a popover owns the bar; freeze the snapshot until it closes.
    if (pinnedRef.current) return;
    const selection = $getSelection();
    // Only a non-collapsed range selection in THIS editor shows the bar.
    if (!$isRangeSelection(selection) || selection.isCollapsed()) {
      setVisible(false);
      return;
    }
    // Read the live DOM selection rect (Lexical keeps it in sync with the model).
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) {
      setVisible(false);
      return;
    }
    const rect = domSelection.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setVisible(false);
      return;
    }

    const next = {} as Record<Mark, boolean>;
    for (const mark of MARK_ORDER) next[mark] = selection.hasFormat(mark);
    setActive(next);
    setLink(selectionLink());
    setColor(selectionColor());

    // Measure the rendered bar if present; otherwise estimate so the first frame
    // is already clamped (avoids a one-frame jump off-screen).
    const barWidth = barRef.current?.offsetWidth || BAR_EST_WIDTH;
    const barHeight = barRef.current?.offsetHeight ?? 0;
    const centeredLeft = rect.left + rect.width / 2 - barWidth / 2;
    const maxLeft = window.innerWidth - barWidth - VIEWPORT_INSET;
    const left = Math.max(VIEWPORT_INSET, Math.min(centeredLeft, maxLeft));
    const top = rect.top - barHeight - BAR_GAP;
    setPosition({ left, top });
    setVisible(true);
  }, []);

  useEffect(() => {
    // `read` so $getSelection is available; the update listener fires on every
    // model change (typing, selection, format toggles → refresh active state).
    const unregisterUpdate = editor.registerUpdateListener(() => {
      editor.getEditorState().read(update);
    });
    // SELECTION_CHANGE catches pure selection moves that don't dirty the tree.
    const unregisterSelection = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        editor.getEditorState().read(update);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    // Hide when focus leaves this editor's content (entering block-selection mode
    // blurs the contenteditable, so this also covers Escape→block-selection).
    const root = editor.getRootElement();
    // Don't hide while a popover pins the bar (focus moved into its input).
    const onBlur = () => {
      if (!pinnedRef.current) setVisible(false);
    };
    root?.addEventListener("blur", onBlur);
    return () => {
      unregisterUpdate();
      unregisterSelection();
      root?.removeEventListener("blur", onBlur);
    };
  }, [editor, update]);

  if (!visible && !pinned) return null;

  const value: FormatToolbarValue = { editor, active, link, color, setPinned };

  return (
    <ViewportOverlay layer="popover" className="pointer-events-none">
      <FormatToolbarProvider value={value}>
        <Surface
          ref={barRef}
          level="overlay"
          // eslint-disable-next-line spacing/no-adhoc-spacing -- absolute-positioned floating bar placed at a computed viewport coordinate (inside the fixed-inset-0 overlay), not sibling rhythm
          className="pointer-events-auto absolute p-2xs"
          style={{ left: position.left, top: position.top }}
        >
          <Stack direction="row" gap="2xs" align="center">
            <Editor.FormatAction.Render />
          </Stack>
        </Surface>
      </FormatToolbarProvider>
    </ViewportOverlay>
  );
}
