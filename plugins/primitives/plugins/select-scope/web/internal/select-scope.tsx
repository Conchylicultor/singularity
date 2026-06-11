import type { KeyboardEvent, ReactNode } from "react";

/**
 * Native editable controls own Ctrl+A — they have their own select-all that
 * scopes to the field's content. ContentScope only governs "loose" non-editable
 * content (code blocks, text rows), so it must defer when the keystroke
 * originates inside an editable element.
 */
function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable;
}

function handleSelectAllScope(e: KeyboardEvent<HTMLElement>) {
  if ((e.ctrlKey || e.metaKey) && e.key === "a" && !e.defaultPrevented) {
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(e.currentTarget);
    sel.addRange(range);
  }
}

/**
 * Spreadable keydown wiring so any element can BE a select-scope without an
 * extra wrapper div. Spread onto a focusable root (`<div {...selectScopeProps}>`,
 * a `<Card>` root, …): the element becomes focusable (`tabIndex=-1`) and its
 * `onKeyDown` intercepts Ctrl/Cmd+A to select only its own DOM subtree.
 */
export const selectScopeProps = {
  tabIndex: -1 as const,
  onKeyDown: handleSelectAllScope,
};

/**
 * Wrapper element that scopes Ctrl+A to its subtree. `fill` (default `true`)
 * keeps `h-full` for layout callers like pane-chrome; pass `fill={false}` for
 * in-flow surfaces (overlays, toasts) that must not stretch.
 */
export function ContentScope({ children, fill = true }: { children: ReactNode; fill?: boolean }) {
  return (
    <div {...selectScopeProps} className={fill ? "outline-none h-full" : "outline-none"}>
      {children}
    </div>
  );
}
