import { selectionRange } from "@plugins/primitives/plugins/dom-selection/web";
import { applyCopySources } from "./rewrite";

/**
 * Install the document-level `copy` handler that puts declared source text on
 * the clipboard. Returns its uninstaller.
 *
 * One listener for the whole app, mounted once at `Core.Root`. It has to be
 * global because the elements that declare a source (chips, badges) are spliced
 * into other plugins' render trees — a per-surface handler would be a list of
 * surfaces to keep in sync with a registry that is open by design.
 *
 * It is deliberately narrow about when it acts. Three gates, each protecting a
 * copy that someone else is already right about:
 *
 * - **`defaultPrevented`** — a handler closer to the selection has already
 *   written the payload it wants (`diff-view` rebuilding a cell copy, Lexical
 *   writing its own node payload). This listener is in the bubble phase, so by
 *   the time it runs that decision has been made, and it never overwrites one.
 * - **inside a `contenteditable`** — the editors own copy there, and for chips
 *   they already do the same job through the node's own `getTextContent()`.
 * - **no declaring element in the selection** — the native copy is already
 *   correct, and re-serializing would only risk being subtly less so.
 */
export function installCopySourceText(): () => void {
  document.addEventListener("copy", onCopy);
  return () => document.removeEventListener("copy", onCopy);
}

function onCopy(event: ClipboardEvent): void {
  if (event.defaultPrevented) return;
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const selection = window.getSelection();
  const live = selectionRange();
  if (!selection || !live || live.collapsed) return;
  if (isInsideEditable(live)) return;

  // Cloned before the stage takes the selection away: this is what we put back.
  const restore = live.cloneRange();
  const fragment = restore.cloneContents();
  if (applyCopySources(fragment) === 0) return;

  const { text, html } = serialize(fragment, selection, restore);
  // Both flavours, from the same rewritten fragment. Once the default is
  // prevented the clipboard carries ONLY what is set here, so writing just the
  // plain text would silently drop the HTML flavour a rich paste target reads —
  // and the two must agree anyway, or pasting the same copy into two apps
  // gives two different answers about what was copied.
  clipboard.setData("text/plain", text);
  clipboard.setData("text/html", html);
  event.preventDefault();
}

/**
 * The browser's own plain text for a fragment it never laid out.
 *
 * `Range.toString()` would concatenate text nodes and lose every block break —
 * paragraphs and list items would run together. The block-aware serializer is
 * reachable only through `Selection.toString()`, and a Selection only points at
 * the live document. So the rewritten fragment is briefly mounted off-screen,
 * selected, read, and torn down.
 *
 * Off-screen, not hidden: the serializer walks layout, so a `display:none`
 * stage serializes as the empty string. `position:fixed` with a negative offset
 * keeps it out of both the viewport and the document's scroll extent.
 *
 * The user's own selection is restored in the `finally` — synchronously, within
 * the same event, so nothing between the copy and the next paint ever observes
 * the stage's selection.
 */
function serialize(
  fragment: DocumentFragment,
  selection: Selection,
  restore: Range,
): { text: string; html: string } {
  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  stage.style.cssText = "position:fixed;top:0;left:-99999px;width:120ch;";
  stage.append(fragment);
  document.body.append(stage);
  try {
    const html = stage.innerHTML;
    const staged = document.createRange();
    staged.selectNodeContents(stage);
    selection.removeAllRanges();
    selection.addRange(staged);
    return { text: selection.toString(), html };
  } finally {
    selection.removeAllRanges();
    selection.addRange(restore);
    stage.remove();
  }
}

/**
 * Whether the selection sits inside an editor's editable region.
 *
 * Matches `contenteditable="false"` too, and that is wanted: an inline chip in a
 * Lexical document is a `contenteditable=false` decorator inside an editable
 * root, and either way the editor owns the copy.
 */
function isInsideEditable(range: Range): boolean {
  const node = range.commonAncestorContainer;
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return element?.closest("[contenteditable]") != null;
}
