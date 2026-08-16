import { createContext, useContext, type ReactNode } from "react";

const PaneScrollContext = createContext<HTMLElement | null>(null);

export function PaneScrollProvider({
  element,
  children,
}: {
  element: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <PaneScrollContext.Provider value={element}>
      {children}
    </PaneScrollContext.Provider>
  );
}

/**
 * The scrolling viewport of the transcript this subtree belongs to — the node
 * `JsonlPane` already holds — or `null` before it mounts (and for anything
 * rendered outside a pane).
 *
 * Overlay contributions sit BESIDE the scroller, not inside it, so they cannot
 * reach it with `findScrollParent` and must not reach it with a global
 * `document.querySelector`: two panes can be open on the same conversation, and
 * transcript rows are keyed by `eventKey` (`user-text:<timestamp>`), which
 * carries no conversation id — so the other pane's rows answer to the very same
 * selectors. Asking the pane you are rendered in is the only lookup that cannot
 * pick the wrong transcript.
 */
export function usePaneScrollElement(): HTMLElement | null {
  return useContext(PaneScrollContext);
}
