import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  Placed,
  placedClasses,
  placedStyle,
} from "@plugins/primitives/plugins/css/plugins/coords/web";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from "lexical";
import { $getSelectionStyleValueForProperty } from "@lexical/selection";
import { $isLinkNode } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  hasBox,
  selectionRect,
} from "@plugins/primitives/plugins/dom/plugins/dom-selection/web";
import { ViewportOverlay } from "@plugins/primitives/plugins/css/plugins/viewport-overlay/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  MARK_ORDER,
  marksOfTextNode,
  type ColorToken,
  type Mark,
} from "../../core";
import { Editor } from "../slots";
import {
  FormatToolbarProvider,
  type FormatToolbarValue,
} from "../internal/format-toolbar-context";
import { caretFormatCue } from "../internal/caret-format-cue";
import { $readMarkBoundary, caretLineRect } from "../internal/caret-geometry";
import { virtualStop } from "../internal/mark-boundary";
import { CaretFormatChip } from "./caret-format-chip";

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

/** On-screen position of a floating surface (viewport coordinates). */
interface SurfacePosition {
  /** Left edge in px (already clamped to the viewport). */
  left: number;
  /**
   * Vertical anchor in px. When `placement` is `"above"` this is the surface's
   * BOTTOM edge (it is pulled up its own height via `translateY(-100%)`); when
   * `"below"` it is its top edge.
   */
  top: number;
  /**
   * Side of the anchor rect the surface sits on. Anchoring the bottom edge for
   * `"above"` (via the CSS translate) means the surface never overlaps what it
   * points at regardless of its measured height — the height is needed only to
   * decide whether it fits, never to keep it clear.
   */
  placement: "above" | "below";
}

/** Natural size of a floating surface, measured or estimated. */
interface SurfaceSize {
  width: number;
  height: number;
}

/** Vertical gap between the anchor rect and the nearest surface edge. */
const SURFACE_GAP = 8;
/** Horizontal viewport inset a surface is clamped to. */
const VIEWPORT_INSET = 8;
/** Estimated bar size, used before the bar has been measured. */
const BAR_ESTIMATE: SurfaceSize = { width: 200, height: 44 };
/** Estimated cue-chip size, used before the chip has been measured. */
const CUE_ESTIMATE: SurfaceSize = { width: 72, height: 20 };

/**
 * Where to put a floating surface beside `rect`, in viewport coordinates.
 *
 * `prefer` is the side the surface WANTS; it flips to the other one only when
 * its own height would not clear the viewport edge on the preferred side. The
 * bar prefers `"above"` (it must never cover the selected text); the cue chip
 * prefers `"below"` (there is no selected text under a caret to hide, and the
 * line ABOVE is what the user is reading). Horizontal placement is the same for
 * both: centred on `rect`, clamped into view.
 *
 * `measured` is the rendered element when there is one; otherwise `estimate`
 * stands in so the FIRST frame is already clamped (no one-frame jump
 * off-screen). On a fresh selection nothing is mounted yet, and the estimate
 * only ever has to be close enough for the flip decision — the
 * `translateY(-100%)` anchor keeps an `"above"` surface clear of the rect
 * whatever its real height turns out to be.
 */
function fitSurface(
  rect: DOMRect,
  measured: HTMLElement | null,
  estimate: SurfaceSize,
  prefer: "above" | "below",
): SurfacePosition {
  const width = measured?.offsetWidth || estimate.width;
  const height = measured?.offsetHeight || estimate.height;
  const centeredLeft = rect.left + rect.width / 2 - width / 2;
  const maxLeft = window.innerWidth - width - VIEWPORT_INSET;
  const left = Math.max(VIEWPORT_INSET, Math.min(centeredLeft, maxLeft));
  const fitsAbove = rect.top - height - SURFACE_GAP >= VIEWPORT_INSET;
  const fitsBelow =
    rect.bottom + height + SURFACE_GAP <= window.innerHeight - VIEWPORT_INSET;
  const placement: SurfacePosition["placement"] =
    prefer === "above"
      ? fitsAbove
        ? "above"
        : "below"
      : fitsBelow
        ? "below"
        : "above";
  const top =
    placement === "above" ? rect.top - SURFACE_GAP : rect.bottom + SURFACE_GAP;
  return { left, top, placement };
}

/**
 * The CSS transform pinning an `"above"` surface's BOTTOM edge to its `top`
 * coordinate. `"below"` needs none — `top` is already its top edge.
 */
function placementTransform(
  placement: SurfacePosition["placement"],
): string | undefined {
  return placement === "above" ? "translateY(-100%)" : undefined;
}

/**
 * Which of the two presentations the current selection calls for, or `null` for
 * neither. Mutually exclusive by construction: `selection.isCollapsed()` picks
 * one, so there is no state in which both could be on screen.
 */
type Presentation =
  /** A non-collapsed selection: the format toolbar. */
  | { kind: "bar" }
  /** A collapsed caret at a mark boundary, or divergent from its surroundings. */
  | { kind: "cue"; marks: Mark[] };

/**
 * The selection format surface, in TWO mutually-exclusive presentations.
 * Mounted inside every block composer.
 *
 * - **A non-collapsed selection → the floating format toolbar.** Controls for
 *   the marks, the link and the color of the selected text.
 * - **A collapsed caret standing at a mark boundary, or one whose pending marks
 *   differ from the text it stands in → the cue chip.** A small word under the
 *   caret (`plain`, `code`, `bold code`) saying what the NEXT typed character
 *   will carry. The boundary arm is what makes a boundary's two states — one
 *   pixel, one linear offset — mutually distinguishable: `` `zz|` `` reads
 *   `code` and `` `zz`| `` reads `plain`. The rule itself is
 *   `internal/caret-format-cue.ts`'s, including what it costs.
 *
 * One mount, one selection-listener set, one positioning routine. A per-block
 * plugin for the cue would have duplicated the containment gate, the rect read,
 * the clamp/flip placement, the blur hide and the document `selectionchange`
 * re-evaluation — and added a second selection listener to every block — to
 * arrive at a snapshot this one already computes: for a collapsed caret,
 * `selection.hasFormat(mark)` per mark IS the pending set.
 *
 * **The cue derives from `selection.format`, and that does not contradict
 * `internal/mark-depth.ts`.** Its header is emphatic that DEPTH must never be
 * derived that way, because three shipped mechanisms alias the divergence and a
 * derived depth would make Backspace strip a whole span. That rule is about edit
 * SEMANTICS; this is presentation. Stated as one line, because the two look
 * alike: **the mark-depth store decides what a KEY does; `selection.format`
 * decides what the SCREEN says.** Nothing here reads or writes the store, and
 * the cue firing for a collapsed-caret Cmd+E or for an autoformat landing is
 * intended — those are exactly the two invisible cases it exists to show, not
 * false positives.
 *
 * The cue also renders WORDS, not controls, so the `Editor.FormatAction` slot is
 * not involved in it and no `formatting/*` sub-plugin has anything to say here.
 *
 * Selection tracking: a single update + SELECTION_CHANGE listener owns the
 * snapshot, gated on the LIVE document selection sitting inside THIS editor's
 * root. Either presentation hides when the selection lands in another editor or
 * the editor blurs; the bar also hides when the selection collapses (the cue
 * takes over), and the cue when the caret is at no boundary and its two mark
 * sets agree.
 *
 * Positioning: both surfaces are portaled through `ViewportOverlay` (so `fixed`
 * resolves against the real viewport, never a transformed ancestor) and
 * horizontally clamped into view. The bar prefers to sit ABOVE the selection —
 * never covering the selected text — and the cue BELOW the caret, so it never
 * covers the line above; each flips when its preferred side has no room. When
 * above, the bottom edge is anchored via a CSS `translateY(-100%)`, so the
 * surface clears its anchor regardless of its measured height. The overlay root
 * is `pointer-events-none` so it never blocks clicks elsewhere; only the bar
 * itself is interactive, and the cue never is.
 *
 * No flicker / no focus steal: position+visibility update synchronously on
 * selection change (no async layout), and the bar's pointer-events are isolated
 * to its own box. Buttons preventDefault on mousedown (see `MarkButton`) so the
 * text selection survives a click.
 */
export function FormatToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [active, setActive] = useState<Record<Mark, boolean>>(emptyActive);
  const [link, setLink] = useState<string | null>(null);
  const [color, setColor] = useState<ColorToken | null>(null);
  const [position, setPosition] = useState<SurfacePosition>({
    left: 0,
    top: 0,
    placement: "above",
  });
  const barRef = useRef<HTMLElement>(null);
  // Separate refs, not one shared `surfaceRef`: only one presentation is mounted
  // at a time, but `update` runs BEFORE the swap renders — so a shared ref would
  // hand the outgoing surface's measurements to the incoming one for a frame.
  const cueRef = useRef<HTMLDivElement>(null);
  // While a control's popover is open it pins the bar visible so blurring the
  // editor into the popover input doesn't collapse the selection and tear the
  // bar down. Held in a ref (read by listeners) mirrored to state (gates render).
  const pinnedRef = useRef(false);
  const [pinned, setPinnedState] = useState(false);

  const update = useCallback(() => {
    // Pinned: a popover owns the bar; freeze the snapshot until it closes.
    if (pinnedRef.current) return;
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      setPresentation(null);
      return;
    }
    // Derive visibility from the LIVE document selection, not just the model: the
    // surface is this editor's only when the native selection's anchor sits
    // inside this editor's root. Without this containment gate a stale model
    // selection (left behind when focus/selection moved elsewhere without a
    // Lexical event reaching us) would strand it on screen.
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) {
      setPresentation(null);
      return;
    }
    const root = editor.getRootElement();
    if (!root || !root.contains(domSelection.anchorNode)) {
      setPresentation(null);
      return;
    }

    if (selection.isCollapsed()) {
      // ---- the CUE: a caret, and what it will type with ----
      // The DOM must agree it is a caret. The anchor rect below is read off the
      // DOM selection, so a native selection that has not collapsed with the
      // model would hand us a whole selection's box rather than a caret's.
      if (!domSelection.isCollapsed) {
        setPresentation(null);
        return;
      }
      // `pending` is the same `selection.hasFormat` scan the bar makes — for a
      // collapsed caret that snapshot IS the pending mark set. The other two
      // inputs come from ONE read of the caret's mark boundary: `surrounding` is
      // that boundary's own `natural` field, and `atBoundary` is whether it holds
      // a virtual stop. Deriving them separately — the boundary here and
      // `marksOfTextNode(anchor.getNode())` there — would let the cue's idea of
      // what the caret stands in disagree with the caret model's, which is the
      // one thing the cue exists to report on.
      const anchorNode = selection.anchor.getNode();
      const pending = MARK_ORDER.filter((mark) => selection.hasFormat(mark));
      const boundary = $readMarkBoundary(selection);
      const cue = caretFormatCue({
        pending,
        // No boundary at all is the ordinary mid-run caret (or an anchor the
        // strip cannot resolve): the caret stands in its own leaf's bits, which
        // is the same `marksOfTextNode` derivation `$boundaryAtTextAnchor` would
        // have handed back as `natural`. A non-text anchor (an element point at
        // an empty paragraph, a `<br>`, a decorator) carries no marks — `[]`,
        // exactly as the boundary strip models a void neighbour.
        surrounding:
          boundary?.natural ??
          ($isTextNode(anchorNode) ? marksOfTextNode(anchorNode) : []),
        atBoundary: boundary !== null && virtualStop(boundary) !== null,
      });
      if (cue.kind === "silent") {
        setPresentation(null);
        return;
      }
      // The chip hangs under the caret's own LINE, which is what
      // `caretLineRect()` answers — the same read the arrow-key line logic uses,
      // so the cue and the caret model agree about where the caret is instead of
      // the cue taking a weaker one. In the common case its primary branch is
      // `pickEdge(range.getClientRects(), "first")` on the collapsed range, i.e.
      // the same narrow caret box this used to read off the DOM range directly,
      // so nothing moves. The difference is the two positions where a collapsed
      // range paints NOTHING — an empty soft line (the caret between two `<br>`s)
      // and the boundary beside an inline decorator chip: there it borrows the
      // neighbouring node's line box, where the previous fallback reached for the
      // editor root's whole box and hung the chip under the ENTIRE block, wrong
      // on both axes on any multi-line one.
      //
      // The root fallback survives as the genuinely last resort: a block with no
      // painted content at all (Cmd+B on a blank line, a common flow) has no line
      // to borrow.
      const anchorRect = caretLineRect() ?? root.getBoundingClientRect();
      if (!hasBox(anchorRect)) {
        setPresentation(null);
        return;
      }
      setPosition(
        fitSurface(anchorRect, cueRef.current, CUE_ESTIMATE, "below"),
      );
      setPresentation({ kind: "cue", marks: cue.marks });
      return;
    }

    // ---- the BAR: a non-collapsed selection, and what is applied to it ----
    if (domSelection.isCollapsed) {
      setPresentation(null);
      return;
    }
    // The selected text's own box. `selectionRect()` folds "no range to read" and
    // "a range carrying no box" into one null, so the bar has a single bail
    // rather than a read followed by an emptiness test of its own.
    const rect = selectionRect();
    if (!rect) {
      setPresentation(null);
      return;
    }

    const next = {} as Record<Mark, boolean>;
    for (const mark of MARK_ORDER) next[mark] = selection.hasFormat(mark);
    setActive(next);
    setLink(selectionLink());
    setColor(selectionColor());

    setPosition(fitSurface(rect, barRef.current, BAR_ESTIMATE, "above"));
    setPresentation({ kind: "bar" });
  }, [editor]);

  const setPinned = useCallback(
    (next: boolean) => {
      pinnedRef.current = next;
      setPinnedState(next);
      // Releasing the pin: re-evaluate now. A popover typically closes via an
      // outside click that fires no Lexical event for this editor, so without
      // this the frozen-visible bar would linger after the selection is gone.
      if (!next) editor.getEditorState().read(update);
    },
    [editor, update],
  );

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
      if (!pinnedRef.current) setPresentation(null);
    };
    root?.addEventListener("blur", onBlur);
    // The native, document-wide selection signal. Lexical's SELECTION_CHANGE only
    // fires while the selection is inside this editor, so a click that clears or
    // moves the selection AWAY from it (deselecting by clicking empty space, or
    // landing in another editor) never reaches the editor-scoped path. This global
    // listener re-evaluates on every such change; `update`'s containment gate then
    // hides the bar — closing the "stays displayed when I click elsewhere" gap.
    const onDocSelectionChange = () => editor.getEditorState().read(update);
    document.addEventListener("selectionchange", onDocSelectionChange);
    return () => {
      unregisterUpdate();
      unregisterSelection();
      root?.removeEventListener("blur", onBlur);
      document.removeEventListener("selectionchange", onDocSelectionChange);
    };
  }, [editor, update]);

  const value = useMemo<FormatToolbarValue>(
    () => ({ editor, active, link, color, setPinned }),
    [editor, active, link, color, setPinned],
  );

  if (!presentation && !pinned) return null;

  // A pin is only reachable from a bar control, and it freezes `update`, so a
  // pinned surface is always the bar — the cue can never be the pinned one.
  if (presentation?.kind === "cue") {
    return (
      <ViewportOverlay layer="popover" className="pointer-events-none">
        {/* A JS-computed viewport coordinate inside the fixed-inset-0 overlay.
            The `transform` stays the caller's: `Placed` writes `translate`, which
            CSS applies FIRST, so the two compose. */}
        <Placed
          ref={cueRef}
          x={{ start: position.left }}
          y={{ start: position.top }}
          style={{ transform: placementTransform(position.placement) }}
        >
          <CaretFormatChip marks={presentation.marks} />
        </Placed>
      </ViewportOverlay>
    );
  }

  return (
    <ViewportOverlay layer="popover" className="pointer-events-none">
      <FormatToolbarProvider value={value}>
        {/* `Surface` owns this element, so the placement arrives as the class +
            style helpers. The `transform` still lifts an "above" bar by its own
            height: `Placed` writes `translate`, applied first, never `transform`. */}
        <Surface
          ref={barRef}
          level="overlay"
          className={cn(placedClasses(), "pointer-events-auto p-2xs")}
          style={{
            ...placedStyle({ start: position.left }, { start: position.top }),
            // "above": anchor the bar's bottom edge at `top` by lifting it its
            // own height, so it always clears the selection without measuring.
            transform: placementTransform(position.placement),
          }}
        >
          <Stack direction="row" gap="2xs" align="center">
            <Editor.FormatAction.Render />
          </Stack>
        </Surface>
      </FormatToolbarProvider>
    </ViewportOverlay>
  );
}
