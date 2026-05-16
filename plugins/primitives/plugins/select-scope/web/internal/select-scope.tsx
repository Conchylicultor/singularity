import type { KeyboardEvent, ReactNode } from "react";

function handleSelectAllScope(e: KeyboardEvent<HTMLElement>) {
  if ((e.ctrlKey || e.metaKey) && e.key === "a" && !e.defaultPrevented) {
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
    <div tabIndex={-1} onKeyDown={handleSelectAllScope} className="outline-none h-full overflow-hidden">
      {children}
    </div>
  );
}
