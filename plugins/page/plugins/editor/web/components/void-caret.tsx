import { useEffect, useRef, type ReactNode } from "react";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { SpaceStep } from "@plugins/primitives/plugins/css/plugins/space-ramp/core";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useBlockEditor } from "../block-editor-context";
import { BLOCK_INSET } from "../internal/page-column";
import type { BlockEditorAPI } from "../types";

/**
 * How a **void** block — one owning no editable text — takes part in the
 * editor's caret model, in one place instead of hand-copied per block type.
 *
 * A text-bearing block gets all of this for free: its Lexical editor IS the
 * focusable node, the browser paints a caret in it, and the shared text
 * renderer registers its focus handle. A void block (divider, sub-page,
 * equation source, code source) has none of that, so every one of them
 * re-derived the same three obligations — register a handle, pull DOM focus
 * when the editor's focus model points here, report focus back — and each got a
 * slightly different subset right. This module states them once.
 *
 * The split below is deliberate:
 *
 * - {@link useVoidCaret} is the PLUMBING, and it takes a `focus` **capability**
 *   rather than a node. That is exactly what lets one hook serve a `<textarea>`
 *   (code, equation), a `Row`'s synthesized inner control (sub-page), and a
 *   plain box ({@link VoidCaretBox}) — three different things, none of which the
 *   hook has to know about. It only ever needs "make yourself the focused
 *   element", which every one of them can answer.
 * - {@link VoidCaretBox} is the CUE, for the subset of void blocks that hold the
 *   caret on a box of their own and therefore have nothing on screen saying the
 *   caret is here. A block whose focus lands in a real text control (code,
 *   equation) needs no cue — it has a blinking caret — and a block that
 *   delegates to `Row` gets the same tint from `Row`'s own `selected`.
 */

/** What a void block hands the editor so the caret can land on it. */
export interface VoidCaretOptions {
  /** The block's row id — the key the editor's focus handle registry is keyed by. */
  blockId: string;
  /** Does the editor's focus model currently point at this block? */
  isFocused: boolean;
  editor: BlockEditorAPI;
  /**
   * Make this block the focused element. A **capability, never a node**: the
   * focus-holding element differs per block type (a textarea, a `Row`'s inner
   * control which `Row` re-synthesizes the moment the row grows actions, a box),
   * and only the block knows which. It may be an inline arrow — it is wrapped
   * with `useEventCallback` internally, so a fresh closure every render does not
   * churn the handle registration.
   */
  focus: () => void;
}

export interface VoidCaret {
  /**
   * Spread onto whichever element actually takes DOM focus, so a click / Tab
   * that focuses this block moves the editor's focus model here too. Without it
   * the two disagree: the browser thinks the user is in this block, the editor
   * thinks they are still in the last one they arrowed through.
   */
  onFocus: () => void;
}

/**
 * Wire a void block into the editor's caret model.
 *
 * Registering the focus handle is not cosmetic: `navigate()` walks the
 * registered handles, so a block with none is **skipped entirely** by arrow-key
 * navigation while a click can still focus it — the caret jumps over a block the
 * user can plainly see and click into. (A void handle registers `focus` only. It
 * deliberately omits `replayInput`, and the caret authority's `landFlight` keys
 * its void arm on exactly that absence, so a landing here resolves without any
 * `onLanded` plumbing on the block's side.)
 *
 * The pull-focus effect has **no "is it already focused?" guard**. Three of the
 * four call sites carried one (`document.activeElement !== ref.current`) and one
 * did not, which is the tell that it was never load-bearing: `.focus()` on the
 * already-focused element fires no focus event and moves no caret, so the guard
 * bought nothing. It is also unspellable here — this holds a capability, not a
 * node, and there is nothing to compare `activeElement` against. That is the
 * point, not a limitation.
 */
export function useVoidCaret({
  blockId,
  isFocused,
  editor,
  focus,
}: VoidCaretOptions): VoidCaret {
  const { registerFocusHandle } = useBlockEditor();
  // Stable identity, latest closure: the registration effect must re-run when
  // the block id changes, never because the caller wrote an inline arrow.
  const focusBlock = useEventCallback(focus);
  const onFocus = useEventCallback(() => editor.onFocus());

  useEffect(
    () => registerFocusHandle(blockId, { focus: focusBlock }),
    [blockId, registerFocusHandle, focusBlock],
  );

  // The editor's focus model is the authority; the DOM follows it. This is what
  // makes a conversion (`---`, `$$`, ```` ``` ````) or an arrow-key landing that
  // kept `focusedBlockId` on this id actually put the keyboard here.
  useEffect(() => {
    if (isFocused) focusBlock();
  }, [isFocused, focusBlock]);

  return { onFocus };
}

/**
 * The box IS the focus-holding element, so it supplies the `focus` capability
 * itself — `Omit`ing it is what makes handing the box a second one unspellable.
 */
export interface VoidCaretBoxProps extends Omit<VoidCaretOptions, "focus"> {
  /** Accessible name for the box — it has no text of its own to be named by. */
  label: string;
  /** Horizontal padding. Defaults to the content-edge inset every block uses. */
  x?: SpaceStep;
  /** Vertical padding. */
  y?: SpaceStep;
  /**
   * The block's own keyboard meaning, run FIRST. Anything it
   * `preventDefault()`s is taken as handled and the box stays out of it.
   */
  onKeyDown?: (e: React.KeyboardEvent) => void;
  children?: ReactNode;
}

/**
 * A focusable box that holds the caret for a void block, and **the one place the
 * "the caret is on this block" cue is written**.
 *
 * The two visual conditions are deliberately SEPARATE, and they layer:
 *
 * - `focus-ring` is the app's canonical indicator for "this element has DOM
 *   keyboard focus" — and it is the same utility that suppresses the browser's
 *   own outline, so the replacement is drawn on **exactly the condition the
 *   original was suppressed for**.
 * - `bg-accent` is "the editor's caret is on this block". It is the tint
 *   `Row.selected` paints, so a void block that delegates to `Row` (sub-page)
 *   and one that uses this box (divider) say the same thing the same way.
 *
 * That separation is the bug this closes. The divider used to write
 * `outline-none` unconditionally and then draw a ring on `isFocused` — a
 * *different* condition — so a box that had genuinely taken keyboard focus while
 * the editor's model disagreed showed **nothing at all**: the browser's
 * indicator was suppressed and the replacement never fired.
 *
 * **Keyboard.** The box handles ArrowUp/ArrowDown itself, after giving the
 * caller first refusal. "The caret can always leave a void block" is the
 * EDITOR's invariant — a block that swallowed the arrows would strand the user
 * — and an invariant belongs to whoever owns it, not to four blocks that each
 * have to remember it. Everything else (what Backspace means here, what Enter
 * seeds) is the block's own meaning and stays with the block.
 */
export function VoidCaretBox({
  blockId,
  isFocused,
  editor,
  label,
  x = BLOCK_INSET,
  y = "sm",
  onKeyDown,
  children,
}: VoidCaretBoxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { onFocus } = useVoidCaret({
    blockId,
    isFocused,
    editor,
    focus: () => ref.current?.focus(),
  });

  function handleKeyDown(e: React.KeyboardEvent) {
    onKeyDown?.(e);
    // The block's meaning wins; `defaultPrevented` is how it says "mine".
    if (e.defaultPrevented) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      editor.navigate("up");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      editor.navigate("down");
    }
  }

  return (
    <Inset
      x={x}
      y={y}
      ref={ref}
      tabIndex={0}
      aria-label={label}
      aria-current={isFocused ? true : undefined}
      onKeyDown={handleKeyDown}
      onFocus={onFocus}
      className={cn(
        "focus-ring cursor-default rounded-md",
        isFocused && "bg-accent",
      )}
    >
      {children}
    </Inset>
  );
}
