import { defineDomScope } from "@plugins/primitives/plugins/scoped-store/plugins/dom-scope/web";

/**
 * The scrolling viewport of the transcript a subtree belongs to.
 *
 * Overlay contributions sit BESIDE the scroller, not inside it, so they cannot
 * reach it with `findScrollParent` and must not reach it with a global
 * `document.querySelector`: two panes can be open on the same conversation, and
 * transcript rows are keyed by `eventKey` (`user-text:<timestamp>`), which
 * carries no conversation id — so the other pane's rows answer to the very same
 * selectors. Asking the pane you are rendered in is the only lookup that cannot
 * pick the wrong transcript.
 */
export const paneScrollScope = defineDomScope<HTMLElement>({
  name: "jsonl.pane-scroll",
  what: "the transcript's scrolling viewport (published by <JsonlPane>)",
  bounds: ["data-event-key", "data-event-index"],
});
