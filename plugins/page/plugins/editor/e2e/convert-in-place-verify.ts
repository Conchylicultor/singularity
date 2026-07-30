// Convert-in-place verification (research/2026-07-28-page-block-write-ownership.md, Stage 1).
//
// What this pins: a conversion that CONSUMES some of the block's own text — the
// slash menu's `/query`, a markdown prefix — strips it from the block's CONTENT
// DOC and writes only the type to the row. The bug it locks out: the strip used
// to be a nested, deferred Lexical update on an editor the type change unmounts,
// while the "real" stripped text was handed to `convertTo` as a row payload —
// but `page_blocks.data.text` is a PROJECTION of the doc, so a row write cannot
// strip anything. End state was a permanent disagreement:
//
//     DOM / content doc:  "/callout"                 ← still there
//     page_blocks row:    type=callout, text=[]      ← converted, text cleared
//
// Per case (fresh blank page each, so nothing carries over):
//   1. the block's row `type` is `wantType`;
//   2. the `/query` (or `> `) marker is gone from the DOM *and* from `data.text`;
//   3. `data.text` ≡ the DOM text — the divergence check that failed before;
//   4. the block id is unchanged and the caret is still collapsed inside it.
//
// Plus one targeted case for the other half of Stage 1: flipping a to-do
// checkbox mid-typing must not write the row's lagged `text` projection back,
// and one DOM-NODE-IDENTITY round trip (`/quote` and `/prompt`, there and back)
// that is the executable spec for `TextBlockLayout`'s totality rules — see
// research/2026-07-29-page-text-block-presentation-api.md.
//
// `/callout` is a WRAP, not a type swap (`BlockHandle.wrapOnConvert`): the origin
// keeps its id AND its `text` type and becomes the new anchor row's first child.
// The strip is exactly the same operation, which is why the case stays here; the
// container half of it is `callout/e2e/callout-wrap-verify.ts`.
//
// Rows are read authoritatively from `GET /api/pages/:pageId/blocks` (never the
// DOM's idea of the row), after polling for the ~1 s doc→`data.text` projection
// to settle — rows are allowed to TRAIL the doc, just never to disagree with it
// forever.
//
// Usage: bun plugins/page/plugins/editor/e2e/convert-in-place-verify.ts [--base <url>] [--out /tmp/convert]
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import type { ElementHandle, Page } from "playwright";
import { blockText, openBlankPage } from "./support/blank-page";

const base = baseUrl();
const out = arg("out", "/tmp/convert");
const r = report("convert-in-place");

/** The projection debounce is ~1 s; poll well past it before calling a row stale. */
const PROJECTION_TIMEOUT_MS = 10_000;

interface Row {
  id: string;
  type: string;
  data: unknown;
}

/** Plain text of a row's `data.text` runs (the `RichText` array), NBSP-normalised. */
function rowPlain(row: Row): string {
  const text = (row.data as { text?: unknown } | null)?.text;
  if (!Array.isArray(text)) return "";
  return text
    .map((run) => String((run as { text?: unknown }).text ?? ""))
    .join("")
    .replace(/ /g, " ")
    .trim();
}

/** Fetch the page's rows from inside the app (same origin, same session). */
async function fetchRows(page: Page, pageId: string): Promise<Row[]> {
  return page.evaluate(async (id: string) => {
    const res = await fetch(`/api/pages/${id}/blocks`);
    if (!res.ok) throw new Error(`GET blocks failed: ${res.status}`);
    return (await res.json()) as Row[];
  }, pageId);
}

/**
 * The row for `blockId` once its `data.text` matches `wantPlain` — or the last
 * row seen when the window expires, so the caller reports the real divergence
 * rather than a timeout.
 */
async function rowWhenProjected(
  page: Page,
  pageId: string,
  blockId: string,
  wantPlain: string,
): Promise<Row | null> {
  const deadline = Date.now() + PROJECTION_TIMEOUT_MS;
  let last: Row | null = null;
  for (;;) {
    const rows = await fetchRows(page, pageId);
    last = rows.find((b) => b.id === blockId) ?? last;
    if (last && rowPlain(last) === wantPlain) return last;
    if (Date.now() > deadline) return last;
    await page.waitForTimeout(400);
  }
}

interface Case {
  label: string;
  /** Keystrokes composing the conversion, typed into the fresh block. */
  type: (page: Page) => Promise<void>;
  /** Expected `page_blocks.type` for the ORIGIN row afterwards. */
  wantType: string;
  /** Expected visible text afterwards (also the expected `data.text` plain). */
  wantText: string;
  /** Substring that must be gone from BOTH the DOM and `data.text`. */
  marker: string;
}

const cases: Case[] = [
  {
    // A WRAP: the origin stays a `text` block and gains a callout parent. What
    // this case pins is the strip, which is identical either way.
    label: "/callout",
    type: async (page) => {
      await page.keyboard.type("hello /callout", { delay: 25 });
      await page.waitForTimeout(600);
      await page.keyboard.press("Enter");
    },
    wantType: "text",
    wantText: "hello",
    marker: "/callout",
  },
  {
    label: "/quote",
    type: async (page) => {
      await page.keyboard.type("hello /quote", { delay: 25 });
      await page.waitForTimeout(600);
      await page.keyboard.press("Enter");
    },
    wantType: "quote",
    wantText: "hello",
    marker: "/quote",
  },
  {
    // The other type that used to own a dispatch component. Its box, glyph and
    // action row are now `chrome` on the shared skeleton, so the strip and the
    // caret behave exactly as for any other text type.
    label: "/prompt",
    type: async (page) => {
      await page.keyboard.type("hello /prompt", { delay: 25 });
      await page.waitForTimeout(600);
      await page.keyboard.press("Enter");
    },
    wantType: "prompt",
    wantText: "hello",
    marker: "/prompt",
  },
  {
    label: "/h1",
    type: async (page) => {
      await page.keyboard.type("hello /h1", { delay: 25 });
      await page.waitForTimeout(600);
      await page.keyboard.press("Enter");
    },
    wantType: "heading-1",
    wantText: "hello",
    marker: "/h1",
  },
  {
    label: "markdown '> '",
    // No Enter: the shortcut fires on the transition INTO the prefixed state,
    // i.e. the moment the trailing space lands. `> ` is claimed by the TOGGLE
    // block, not quote (see the note in `quote/core/quote-block.ts`).
    type: async (page) => {
      await page.keyboard.type("> toggled", { delay: 25 });
    },
    wantType: "toggle",
    wantText: "toggled",
    marker: ">",
  },
];

await withBrowser(async (h) => {
  const { page } = await h.session({ label: "A" });

  for (const c of cases) {
    const doc = await openBlankPage(page, base, { settleMs: 3000 });
    const blockId = doc.blockId;
    r.note(`${c.label}: page ${doc.pageId} block ${blockId}`);

    await c.type(page);
    await page.waitForTimeout(1500);
    await snap(page, out, c.label.replace(/[^a-z0-9]+/gi, "-"));

    // The block is looked up BY ID: a conversion must keep the block's identity
    // (and therefore its content doc), so a new id here is itself the failure.
    const converted = page
      .locator(`[data-block-id="${blockId}"] [contenteditable="true"]`)
      .first();
    const stillThere = (await converted.count()) > 0;
    r.ok(`${c.label}: block id unchanged`, stillThere, `looked for ${blockId}`);
    if (!stillThere) continue;

    const domText = await blockText(converted);
    const row = await rowWhenProjected(page, doc.pageId, blockId, c.wantText);
    if (!row) {
      r.fail(`${c.label}: row present`, `no row for ${blockId}`);
      continue;
    }
    const plain = rowPlain(row);
    r.note(`dom=${JSON.stringify(domText)} data.text=${JSON.stringify(plain)}`);

    // 1. the type changed.
    r.eq(`${c.label}: row type`, row.type, c.wantType);
    // 2. the marker is gone from BOTH owners.
    r.ok(
      `${c.label}: marker stripped from the DOM`,
      !domText.includes(c.marker),
      `dom=${JSON.stringify(domText)}`,
    );
    r.ok(
      `${c.label}: marker stripped from data.text`,
      !plain.includes(c.marker),
      `data.text=${JSON.stringify(plain)}`,
    );
    // 3. the two owners agree — the check that failed before Stage 1.
    r.eq(`${c.label}: data.text ≡ DOM text`, plain, domText);
    r.eq(`${c.label}: text preserved around the marker`, domText, c.wantText);

    // 4. the caret survived, collapsed, inside the same block.
    const caret = await page.evaluate((id: string) => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return { has: false, collapsed: false, inside: false };
      const el = document.querySelector(`[data-block-id="${id}"] [contenteditable="true"]`);
      return {
        has: true,
        collapsed: sel.isCollapsed,
        inside: !!el && !!sel.anchorNode && el.contains(sel.anchorNode),
      };
    }, blockId);
    const caretOk = caret.has && caret.collapsed && caret.inside;
    r.ok(`${c.label}: caret collapsed inside the block`, caretOk, JSON.stringify(caret));
  }

  // --- DOM-node identity across a /quote and /prompt round trip ---------------
  //
  // The direct test for `TextBlockLayout`'s totality rules
  // (research/2026-07-29-page-text-block-presentation-api.md). Everything above
  // asserts the block's *row* identity; this asserts the identity of the DOM
  // ELEMENT: the very same `[contenteditable]` node — not merely an equal one —
  // must survive every conversion, in both directions.
  //
  // It is the only assertion that catches a skeleton element which vanishes: a
  // primitive collapsing to a Fragment on empty props, a region that changes the
  // children-array LENGTH instead of occupying one slot, or a per-type wrapper
  // sneaking back in. Any of those changes the element type at a position, React
  // unmounts the subtree, and the user's caret, focus and Yjs↔Lexical binding go
  // with it — the reported `/quote` bug, and the never-reported `/prompt` one.
  //
  // The prompt's chips are NOT asserted here: they only exist once a real agent
  // has been launched, which is `prompt/plugins/block/e2e/prompt-launch.ts`'s
  // job. The launch CONTROL is the observable proxy for the whole footer region.
  {
    const doc = await openBlankPage(page, base, { settleMs: 3000 });
    const blockId = doc.blockId;
    const sel = `[data-block-id="${blockId}"] [contenteditable="true"]`;
    r.note(`identity: page ${doc.pageId} block ${blockId}`);

    /** Hold the LIVE editable element, so identity can be compared later. */
    const grab = async (): Promise<ElementHandle<SVGElement | HTMLElement>> => {
      const h = await page.locator(sel).first().elementHandle();
      if (!h) throw new Error(`no contenteditable in block ${blockId}`);
      return h;
    };
    /** Is the element on screen right now the SAME node we grabbed before? */
    const stillSame = (held: ElementHandle<SVGElement | HTMLElement>) =>
      page.evaluate(
        ({ el, s }) => {
          const live = document.querySelector(s);
          return { same: live === el, connected: (el as Element).isConnected, present: !!live };
        },
        { el: held, s: sel },
      );
    // `isVisible()` resolves false for a missing element — it does not throw —
    // so absence is a real answer here, not a swallowed failure.
    const launchVisible = () =>
      page.getByRole("button", { name: /^Launch / }).first().isVisible();
    /** Commit a slash-menu conversion from the end of the block's text. */
    const convertVia = async (query: string) => {
      await page.locator(sel).first().click();
      await page.keyboard.press("End");
      await page.keyboard.type(` ${query}`, { delay: 25 });
      await page.waitForTimeout(600);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1200);
    };

    await page.keyboard.type("hello", { delay: 25 });
    await page.waitForTimeout(400);
    const held = await grab();

    for (const step of [
      { label: "→ quote", query: "/quote", wantType: "quote", wantLaunch: false },
      { label: "quote → text", query: "/text", wantType: "text", wantLaunch: false },
      { label: "→ prompt", query: "/prompt", wantType: "prompt", wantLaunch: true },
      { label: "prompt → text", query: "/text", wantType: "text", wantLaunch: false },
    ]) {
      await convertVia(step.query);
      await snap(page, out, `identity-${step.query.replace(/\W+/g, "")}-${step.wantType}`);

      const node = await stillSame(held);
      r.ok(
        `identity ${step.label}: the SAME [contenteditable] element survived`,
        node.same && node.connected,
        JSON.stringify(node),
      );

      const rows = await fetchRows(page, doc.pageId);
      const row = rows.find((b) => b.id === blockId);
      r.eq(`identity ${step.label}: row type`, row?.type, step.wantType);
      r.eq(`identity ${step.label}: block id unchanged`, row?.id, blockId);

      // The footer region follows the TYPE, on the same untouched element tree.
      r.eq(
        `identity ${step.label}: launch control ${step.wantLaunch ? "present" : "absent"}`,
        await launchVisible(),
        step.wantLaunch,
      );
    }

    // Typing IMMEDIATELY after a conversion, with no re-focus, must land in the
    // same block — the caret never left it.
    await page.keyboard.type(" world", { delay: 25 });
    await page.waitForTimeout(1200);
    const afterTyping = await stillSame(held);
    r.ok(
      "identity: typing straight after the conversion kept the same element",
      afterTyping.same && afterTyping.connected,
      JSON.stringify(afterTyping),
    );
    // Each `/query` was typed after a space (the slash trigger needs a word
    // boundary) and only the QUERY is stripped, so the four conversions leave
    // four real spaces the user typed. Collapse runs of whitespace: what is under
    // test is that the keystrokes landed in this block, not the space count.
    const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
    const domAfter = await blockText(page.locator(sel).first());
    r.eq("identity: the keystrokes landed in the same block", collapse(domAfter), "hello world");
    const finalRow = await rowWhenProjected(page, doc.pageId, blockId, domAfter);
    r.eq(
      "identity: data.text agrees after the round trip",
      finalRow ? collapse(rowPlain(finalRow)) : null,
      "hello world",
    );
    await snap(page, out, "identity-final");
  }

  // --- the spread leak: a non-text control must not write text ----------------
  // `update` REPLACES the row's `data`, so the to-do checkbox used to restate
  // `{...data}` — including the row's ≤1 s-lagged `text` projection. Flip it
  // WHILE the projection is still pending and the row must end up with the text
  // the user typed, not the snapshot the checkbox carried.
  {
    const doc = await openBlankPage(page, base, { settleMs: 3000 });
    const blockId = doc.blockId;
    r.note(`to-do checkbox: page ${doc.pageId} block ${blockId}`);
    await page.keyboard.type("[] ", { delay: 25 });
    await page.waitForTimeout(600);
    await page.keyboard.type("buy milk", { delay: 25 });
    // Deliberately NO wait: the checkbox flip must race the pending projection.
    const checkbox = page.locator(`[data-block-id="${blockId}"] input[type="checkbox"]`).first();
    await checkbox.click();
    await page.waitForTimeout(1500);
    await snap(page, out, "todo-checkbox");

    const block = page.locator(`[data-block-id="${blockId}"] [contenteditable="true"]`).first();
    const domText = await blockText(block);
    const row = await rowWhenProjected(page, doc.pageId, blockId, "buy milk");
    if (!row) {
      r.fail("to-do checkbox: row present", `no row for ${blockId}`);
    } else {
      const plain = rowPlain(row);
      r.note(`dom=${JSON.stringify(domText)} data=${JSON.stringify(row.data)}`);
      r.eq("to-do checkbox: row type", row.type, "to-do");
      r.eq("to-do checkbox: checked was written", (row.data as { checked?: unknown }).checked, true);
      r.eq("to-do checkbox: DOM text intact", domText, "buy milk");
      r.eq("to-do checkbox: data.text not reverted", plain, "buy milk");
    }
  }
});

r.finish();
