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

export function ContentScope({ children }: { children: ReactNode }) {
  return (
    <div tabIndex={-1} onKeyDown={handleSelectAllScope} className="outline-none h-full">
      {children}
    </div>
  );
}
