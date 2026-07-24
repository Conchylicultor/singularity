// The local user must never render as a remote collaborator, verified in a
// real browser.
//
// The defect: `BindingReplica` handed `CollaborationPlugin` a fresh replica doc
// but DELEGATED the canonical provider's `Awareness`. `@lexical/yjs`'s
// `syncCursorPositions` renders a caret + name label for every awareness state
// whose `clientID !== binding.clientID` — and `binding.clientID` is the doc the
// binding attached to (the replica's), while the delegated awareness was keyed
// by the canonical doc's. So the user's OWN state failed its own identity check
// and every caret move drew one of Lexical's 16 anonymous animal names
// ("Tiger", "Squid", …) trailing the caret.
//
// Observed on the unfixed build: a "Tiger" label trailing the user's own caret
// in every block, on a single-client page.
//
// Usage: bun plugins/page/plugins/editor/e2e/no-collab-cursors-verify.ts [--base <url>]
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { openBlankPage } from "./support/blank-page";

const base = baseUrl();
const out = arg("out", "/tmp/no-collab-cursors");
const r = report();

/** `@lexical/react`'s built-in anonymous collaborator names (LexicalCollaborationContext). */
const LEXICAL_NAMES = [
  "Cat",
  "Dog",
  "Rabbit",
  "Frog",
  "Fox",
  "Hedgehog",
  "Pigeon",
  "Squirrel",
  "Bear",
  "Tiger",
  "Leopard",
  "Zebra",
  "Wolf",
  "Owl",
  "Gull",
  "Squid",
];

await withBrowser(async (h) => {
  const { page } = await h.session();

  await openBlankPage(page, base, { settleMs: 3000 });

  /**
   * The name labels Lexical paints for remote peers: an absolutely-positioned
   * `<span>` holding the peer's name, appended into the binding's own cursors
   * container (a bare div portaled to `document.body`). Matched on name + the
   * inline `position: absolute` the cursor DOM always carries, so ordinary page
   * prose that happens to read "Bear" cannot trip it. Leaf spans only: the name
   * span is a CHILD of the caret span, so both carry the name as `textContent`
   * and counting every match would report one cursor as two.
   */
  const cursorLabels = (): Promise<string[]> =>
    page.evaluate((names) => {
      const labels: string[] = [];
      for (const span of document.querySelectorAll("body > div span")) {
        const text = span.textContent ?? "";
        const isLabel =
          span instanceof HTMLElement &&
          span.style.position === "absolute" &&
          span.childElementCount === 0;
        if (isLabel && names.includes(text)) labels.push(text);
      }
      return labels;
    }, LEXICAL_NAMES);

  // Negative control FIRST: every assertion below is an absence, so a detector
  // that silently matches nothing would report a clean bill of health forever.
  // Synthesize the exact DOM `createCursorSelection` builds for a remote peer
  // (an absolutely-positioned name span inside a body-level container) and
  // require the detector to see it.
  const planted = await page.evaluate(() => {
    const container = document.createElement("div");
    const caret = document.createElement("span");
    caret.style.position = "absolute";
    const name = document.createElement("span");
    name.style.position = "absolute";
    name.textContent = "Tiger";
    caret.appendChild(name);
    container.appendChild(caret);
    container.id = "e2e-planted-cursor";
    document.body.appendChild(container);
    return true;
  });
  r.ok("negative control planted", planted);
  r.eq("detector sees a planted cursor label", await cursorLabels(), ["Tiger"]);
  await page.evaluate(() =>
    document.getElementById("e2e-planted-cursor")?.remove(),
  );
  r.eq("detector clean once the control is removed", await cursorLabels(), []);

  // Typing is what moves the caret, and a caret move is what writes
  // anchorPos/focusPos into awareness and fires the cursor sync.
  await page.keyboard.type("alpha bravo charlie");
  await page.waitForTimeout(800);
  r.eq("no cursor label after typing", await cursorLabels(), []);

  // Arrow navigation with no text change — the pure selection-update path.
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(400);
  r.eq("no cursor label after arrow navigation", await cursorLabels(), []);

  // A second block: a NEW binding, a new replica doc, a new awareness.
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("delta");
  await page.waitForTimeout(800);
  r.eq("no cursor label in a second block", await cursorLabels(), []);

  // Selection (non-collapsed) drives the selection-highlight branch, which
  // paints its own labelled overlay for a remote peer.
  await page.keyboard.down("Shift");
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.up("Shift");
  await page.waitForTimeout(400);
  r.eq("no cursor label with a range selection", await cursorLabels(), []);

  await snap(page, out, "final");

  r.finish();
});
