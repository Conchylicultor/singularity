// OverlayPanel's scroll-edge fade — the "there is more below" signal.
//
// The claim under test is narrow and easy to fake, so every assertion reads the
// SAME element two ways: the panel's own scroll metrics (is there really more
// content that way?) and the painted `::before`/`::after` opacity (is the
// gradient actually on?). A fade that is always on would satisfy the second
// alone; a data attribute nobody styled would satisfy the first alone.
//
// Four states, all driven on a throwaway page this script creates itself:
//
//  1. "Turn into" block menu at rest — bottom fade ON, top fade OFF.
//  2. The same menu scrolled into the middle — BOTH on.
//  3. The same menu scrolled to the end — top ON, bottom OFF.
//  4. The `/` slash menu filtered down until the list fits — NEITHER on.
//
// Usage: bun plugins/primitives/plugins/css/plugins/ui-kit/e2e/scroll-fade-verify.ts \
//          [--base <url>] [--out /tmp/scroll-fade] [--headed]
import type { Page } from "playwright";
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { openBlankPage } from "@plugins/page/plugins/editor/e2e";

const base = baseUrl();
const out = arg("out", "/tmp/scroll-fade");
const r = report();

const HANDLE = 'button[aria-label="Reorder or open block actions"]';

interface Probe {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  /** True when the panel really does have content past that edge. */
  moreAbove: boolean;
  moreBelow: boolean;
  attrTop: boolean;
  attrBottom: boolean;
  /** Painted opacity of the two sticky gradient strips. */
  paintTop: string;
  paintBottom: string;
}

/**
 * Read the most recently opened overlay panel. `.at(-1)` rather than `[0]`: a
 * dialog or a stale closing panel elsewhere in the DOM would otherwise be the
 * one measured.
 */
async function probe(page: Page): Promise<Probe | null> {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll<HTMLElement>(".scroll-fade")].at(-1);
    if (!el) return null;
    return {
      scrollTop: Math.round(el.scrollTop),
      clientHeight: Math.round(el.clientHeight),
      scrollHeight: Math.round(el.scrollHeight),
      moreAbove: el.scrollTop > 1,
      moreBelow: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
      attrTop: el.hasAttribute("data-fade-top"),
      attrBottom: el.hasAttribute("data-fade-bottom"),
      paintTop: getComputedStyle(el, "::before").opacity,
      paintBottom: getComputedStyle(el, "::after").opacity,
    };
  });
}

/** Assert one state end to end: metrics ⇒ attributes ⇒ paint. */
function expect(label: string, p: Probe, top: boolean, bottom: boolean): void {
  r.eq(`${label}: content above?`, p.moreAbove, top);
  r.eq(`${label}: content below?`, p.moreBelow, bottom);
  r.eq(`${label}: data-fade-top`, p.attrTop, top);
  r.eq(`${label}: data-fade-bottom`, p.attrBottom, bottom);
  r.eq(`${label}: ::before painted`, p.paintTop, top ? "1" : "0");
  r.eq(`${label}: ::after painted`, p.paintBottom, bottom ? "1" : "0");
}

/**
 * The one precondition of the state under test — what must be TRUE of the
 * panel's own geometry before "settled" can mean anything.
 *
 * Without one, every wait here is trivially satisfiable by the state that came
 * BEFORE the interaction: `page.mouse.wheel` resolves before the browser has
 * begun animating the scroll, and `keyboard.type` resolves before React has
 * re-rendered the filtered list, so a check that only asks "has it stopped
 * changing?" answers yes about the previous state.
 */
interface FadeGate {
  /** The scroll must have actually moved off this offset. */
  movedFrom?: number;
  /** The panel must overflow — nothing to signal if it fits. */
  scrollable?: boolean;
  /** The panel must NOT overflow — the filtered-down case. */
  fits?: boolean;
}

/** Wheel over the open panel, then let the fade settle at its new offset. */
async function wheelPanel(page: Page, dy: number): Promise<void> {
  const panel = page.locator(".scroll-fade").last();
  await panel.hover({ position: { x: 40, y: 40 } });
  const movedFrom = await panel.evaluate((el) => Math.round(el.scrollTop));
  await page.mouse.wheel(0, dy);
  await settleFade(page, { movedFrom });
}

/**
 * Wait until nothing the assertions read can still change — asking the BROWSER,
 * never sleeping for a duration.
 *
 * The fade lands in three hops, and a probe taken between any two of them reads
 * a half-updated frame: the scroll animation lands, THEN React commits the
 * measurement into `data-fade-*`, THEN the 120ms opacity transition runs. In a
 * headless browser painting at ~10fps those hops span half a second, so the
 * middle plateau (attribute already on, `::before` opacity still at the
 * transition's start value of `0`) is wide enough to swallow any fixed wait —
 * which is exactly how this script used to fail on "turn-into mid".
 *
 * So each hop is waited on by its own signal:
 *
 *  1. **the gate + held geometry** — the interaction has taken effect, and
 *     `scrollTop`/`clientHeight`/`scrollHeight` are unchanged across two
 *     consecutive frames (a wheel scroll is animated; a filtered list reflows).
 *  2. **attributes agree with metrics** — React has committed. Bounded, so a
 *     hook that measured wrong never satisfies it and the wait fails loudly
 *     rather than the assertion reading a stale attribute.
 *  3. **no fade transition is running** — `getAnimations` reports the paint has
 *     finished moving. A CSS transition is dropped once it finishes, so an empty
 *     set is "arrived", and a fade whose CSS never matched arms no transition at
 *     all — it settles instantly at the wrong opacity and the assertion fires.
 */
async function settleFade(page: Page, gate: FadeGate = {}): Promise<void> {
  // The held-geometry memo lives on `window` because `waitForFunction` evaluates
  // a fresh function per poll — so it must be cleared per wait, or the last
  // frame of the previous state counts as this one's first.
  await page.evaluate(() => {
    delete (window as unknown as { __fadeGeom?: string }).__fadeGeom;
  });
  await page.waitForFunction(
    (g: FadeGate) => {
      const el = [...document.querySelectorAll<HTMLElement>(".scroll-fade")].at(-1);
      if (!el) return false;
      const scrollTop = Math.round(el.scrollTop);
      const { clientHeight, scrollHeight } = el;
      if (g.movedFrom !== undefined && scrollTop === Math.round(g.movedFrom)) return false;
      if (g.scrollable === true && scrollHeight <= clientHeight) return false;
      if (g.fits === true && scrollHeight > clientHeight + 1) return false;

      const w = window as unknown as { __fadeGeom?: string };
      const geom = `${scrollTop}|${clientHeight}|${scrollHeight}`;
      const held = w.__fadeGeom === geom;
      w.__fadeGeom = geom;
      if (!held) return false;

      const top = el.scrollTop > 1;
      const bottom = el.scrollTop + clientHeight < scrollHeight - 1;
      if (el.hasAttribute("data-fade-top") !== top) return false;
      if (el.hasAttribute("data-fade-bottom") !== bottom) return false;

      // Force the pending style recalc BEFORE asking what is animating: a
      // `waitForFunction` poll runs in an animation-frame callback, ahead of the
      // frame's own style update, so a transition the attribute flip just armed
      // does not exist yet — and an unforced `getAnimations` would report
      // "nothing animating" one frame too early, at opacity 0.
      void getComputedStyle(el, "::before").opacity;
      void getComputedStyle(el, "::after").opacity;
      return el
        .getAnimations({ subtree: true })
        .every((a) => !(a.effect as KeyframeEffect | null)?.pseudoElement);
    },
    gate,
    { polling: "raf", timeout: 15_000 },
  );
}

await withBrowser(async (h) => {
  const { page, captured } = await h.session({ viewport: { width: 1280, height: 700 } });

  const doc = await openBlankPage(page, base, { settleMs: 500 });
  r.note(`throwaway page: ${doc.pageUrl}`);

  // ---- 1 / 2 / 3 — the "Turn into" menu -----------------------------------
  await doc.block.hover();
  await page.locator(HANDLE).first().click();
  await page.waitForSelector(".scroll-fade", { timeout: 10_000 });
  await settleFade(page, { scrollable: true });

  const rest = await probe(page);
  await snap(page, out, "turn-into-rest");
  if (!rest) return r.fail("turn-into: panel found");
  r.note(`turn-into rest: ${JSON.stringify(rest)}`);
  r.ok(
    "turn-into: the panel is the clamped scroller",
    rest.scrollHeight > rest.clientHeight,
    `${rest.scrollHeight} vs ${rest.clientHeight} — nothing to signal if it fits`,
  );
  expect("turn-into rest", rest, false, true);

  await wheelPanel(page, 120);
  const mid = await probe(page);
  await snap(page, out, "turn-into-mid");
  if (!mid) return r.fail("turn-into mid: panel found");
  r.note(`turn-into mid: ${JSON.stringify(mid)}`);
  expect("turn-into mid", mid, true, true);

  await wheelPanel(page, 2000);
  const end = await probe(page);
  await snap(page, out, "turn-into-end");
  if (!end) return r.fail("turn-into end: panel found");
  r.note(`turn-into end: ${JSON.stringify(end)}`);
  expect("turn-into end", end, true, false);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ---- 4 — the `/` menu, filtered until it fits ----------------------------
  await doc.block.click();
  await page.keyboard.type("/");
  await page.waitForSelector(".scroll-fade", { timeout: 10_000 });
  await settleFade(page, { scrollable: true });

  const slashOpen = await probe(page);
  await snap(page, out, "slash-open");
  if (!slashOpen) return r.fail("slash: panel found");
  r.note(`slash open: ${JSON.stringify(slashOpen)}`);

  // Typing narrows the list with NO scroll event — the case a scroll listener
  // alone cannot see, and the reason the panel also runs a ResizeObserver.
  await page.keyboard.type("quo", { delay: 40 });
  await settleFade(page, { fits: true });
  const slashFiltered = await probe(page);
  await snap(page, out, "slash-filtered");
  if (!slashFiltered) return r.fail("slash filtered: panel found");
  r.note(`slash filtered: ${JSON.stringify(slashFiltered)}`);
  r.ok(
    "slash filtered: the list now fits",
    slashFiltered.scrollHeight <= slashFiltered.clientHeight + 1,
    `${slashFiltered.scrollHeight} vs ${slashFiltered.clientHeight}`,
  );
  expect("slash filtered", slashFiltered, false, false);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ---- 5 — Select is exempt BY CONSTRUCTION, not by luck --------------------
  // Under `alignItemWithTrigger` base-ui makes the inner `[role=listbox]` the
  // scroller and writes `height:100%` / `max-height:100%` down the chain, so the
  // PANEL never overflows and its fade never arms — Select keeps its own scroll
  // arrows with no double affordance. The pseudo-elements are new children of
  // that panel, so this is also the percentage chain's regression test.
  // Escape closes the menu but leaves the query text ("/quo") in the block, so
  // the block must be emptied first — otherwise the next query reads
  // "quo/code", matches nothing, and Enter inserts no code block at all. (That
  // was the real reason this section used to time out on the language picker:
  // the trigger was never in the DOM.)
  await doc.block.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("/code", { delay: 40 });
  await page.waitForTimeout(600);
  await page.keyboard.press("Enter");

  // The picker is a hover-revealed affordance: present in the DOM but
  // `opacity-0 pointer-events-none` until the code block is hovered. Wait for
  // ATTACHED (opacity-0 still counts as visible to Playwright, so "visible"
  // would say nothing), then hover the block to arm it — `click()`'s own
  // actionability retry does the rest.
  const codeBlock = page.locator('[data-block-id]:has(button[aria-label="Code language"])').first();
  const langTrigger = codeBlock.locator('button[aria-label="Code language"]').first();
  await langTrigger.waitFor({ state: "attached", timeout: 10_000 });
  await codeBlock.hover();
  await langTrigger.click();
  // Scoped to the popup, NOT a bare `[role="listbox"]`: the page block editor is
  // itself a multi-selectable `role="listbox"` (block-editor.tsx), and it comes
  // first in document order — so the bare selector resolved to the PAGE, made
  // this wait vacuous, and measured the document instead of the list.
  const listbox = page.locator('[data-slot="select-content"] [role="listbox"]').first();
  await listbox.waitFor({ state: "visible", timeout: 10_000 });
  await settleFade(page);

  const select = await probe(page);
  await snap(page, out, "select-open");
  const list = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-slot="select-content"] [role="listbox"]');
    if (!el) return null;
    return {
      clientHeight: Math.round(el.clientHeight),
      scrollHeight: Math.round(el.scrollHeight),
      arrows: document.querySelectorAll("[data-slot^=select-scroll]").length,
    };
  });
  r.note(`select panel: ${JSON.stringify(select)} / list: ${JSON.stringify(list)}`);
  if (!select || !list) return r.fail("select: panel + listbox found");
  r.ok(
    "select: the LIST is the scroller (many languages)",
    list.scrollHeight > list.clientHeight,
    `${list.scrollHeight} vs ${list.clientHeight}`,
  );
  expect("select panel", select, false, false);

  await page.keyboard.press("Escape");
  r.ok("no page errors", captured.pageErrors.length === 0, captured.pageErrors.join(" | "));
});

r.finish();
