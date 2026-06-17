// Regression guard for the "sidebar tail clipped below the viewport" class of
// bug (see plugins/primitives/plugins/css/plugins/ui-kit/web/components/ui/sidebar.tsx).
//
// The app shell nests the sidebar inside an offset, transformed container, so
// any chrome above it (the app tab bar) shifts the sidebar down. If the sidebar
// is sized to the viewport (`h-svh`) instead of its container (`h-full`), it
// overshoots the bottom and silently clips its last nav item. This guard fails
// loudly when that happens — at a deliberately short viewport, which is the
// first place the tail falls off.
//
// Usage: bun e2e/sidebar-visibility.mjs --url http://<wt>.localhost:9000/agents
import { chromium } from "playwright";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const URL = args.url ?? "http://singularity.localhost:9000/agents";
// A short viewport is the stress case: the tail is the first thing to clip.
const VW = Number(args.width ?? 1280);
const VH = Number(args.height ?? 620);
const TOL = 2; // px; sub-pixel rounding slack.

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const report = await page.evaluate(
  ({ vh, tol }) => {
    const container = document.querySelector('[data-slot="sidebar-container"]');
    if (!container) return { ok: false, reason: "no sidebar-container found" };
    const cr = container.getBoundingClientRect();

    // 1) The sidebar must sit fully within the viewport — not overshoot the
    //    bottom (the h-svh-vs-h-full failure) nor start above the top.
    const overshoot = Math.round(cr.bottom - vh);
    const containerWithinViewport = cr.top >= -tol && cr.bottom <= vh + tol;

    // 2) Every *fixed* nav item (Tasks/Agents/Explorer/Stats…) must render
    //    fully inside the container's box. Items that live inside an internal
    //    scroll region (e.g. the Conversations queue list) are SUPPOSED to
    //    scroll past the container bottom, so exclude any button with a
    //    scrollable ancestor between it and the container.
    const isScrolled = (el) => {
      for (let p = el.parentElement; p && p !== container; p = p.parentElement) {
        const oy = getComputedStyle(p).overflowY;
        if (oy === "auto" || oy === "scroll" || oy === "hidden") return true;
      }
      return false;
    };
    const items = [...container.querySelectorAll('[data-slot="sidebar-menu-button"]')]
      .filter((el) => !isScrolled(el));
    const clipped = items
      .map((el) => ({ label: el.textContent.trim().slice(0, 24), r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.height > 0 && (r.bottom > cr.bottom + tol || r.top < cr.top - tol))
      .map(({ label, r }) => ({ label, bottom: Math.round(r.bottom) }));

    return {
      ok: containerWithinViewport && clipped.length === 0,
      overshoot,
      containerBottom: Math.round(cr.bottom),
      viewportBottom: vh,
      navItemCount: items.length,
      clipped,
    };
  },
  { vh: VH, tol: TOL },
);

console.log(`[sidebar-visibility] ${URL} @ ${VW}x${VH}`);
console.log(JSON.stringify(report, null, 2));
await browser.close();

if (!report.ok) {
  console.error(
    `FAIL: sidebar clipped (overshoot ${report.overshoot}px below viewport` +
      `${report.clipped?.length ? `, ${report.clipped.length} nav item(s) cut off: ${report.clipped.map((c) => c.label).join(", ")}` : ""}).`,
  );
  process.exit(1);
}
console.log("PASS: sidebar fully visible; no nav items clipped.");
