// Verify the overscroll-hint primitive: a wasted wheel gesture (nothing
// scrolls) should rubber-band the surface (inline translate transform); a wheel
// on a genuinely scrollable surface should not.
//
// Usage: bun plugins/primitives/plugins/overscroll-hint/e2e/overscroll-hint-verify.ts [--base <url>]
import {
  baseUrl,
  report,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const url = baseUrl();
const r = report();

await withBrowser(async (h) => {
  const { page } = await h.session();
  await page.goto(url);
  await page.waitForTimeout(4000);

  const result = await page.evaluate(async () => {
    const nextFrame = (): Promise<void> =>
      new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));
    const tick = (ms: number): Promise<void> =>
      new Promise((res) => setTimeout(() => res(), ms));
    const pulled = (el: HTMLElement): boolean => /translate/.test(el.style.transform || "");

    // --- POSITIVE: a non-scrollable scroll viewport ---
    // Build a small overflow-y:auto container whose content fits (not scrollable).
    const dead = document.createElement("div");
    dead.style.cssText =
      "position:fixed;top:0;left:0;width:200px;height:200px;overflow-y:auto;z-index:99999;";
    const deadChild = document.createElement("div");
    deadChild.textContent = "fits";
    deadChild.style.cssText = "height:50px;";
    dead.appendChild(deadChild);
    document.body.appendChild(dead);

    deadChild.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }),
    );
    await nextFrame();
    await tick(20);
    // During the active hold the surface carries a non-zero translate…
    const positivePulled = pulled(dead);
    // …a second wasted push keeps moving it further (live, not one-shot).
    const firstOffset = dead.style.transform;
    deadChild.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }),
    );
    await nextFrame();
    await tick(20);
    const keepsMoving = pulled(dead) && dead.style.transform !== firstOffset;

    // --- NEGATIVE: a genuinely scrollable surface ---
    const live = document.createElement("div");
    live.style.cssText =
      "position:fixed;top:0;left:300px;width:200px;height:200px;overflow-y:auto;z-index:99999;";
    const liveChild = document.createElement("div");
    liveChild.style.cssText = "height:2000px;";
    live.appendChild(liveChild);
    document.body.appendChild(live);

    // Simulate a real scroll: actually move scrollTop + fire a scroll event,
    // matching what the browser does on a successful wheel.
    liveChild.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }),
    );
    live.scrollTop = 120;
    live.dispatchEvent(new Event("scroll", { bubbles: false }));
    await nextFrame();
    await tick(20);
    const negativePulled = pulled(live);

    dead.remove();
    live.remove();
    return { positivePulled, keepsMoving, negativePulled };
  });

  r.ok("positive (wasted gesture rubber-banded)", result.positivePulled === true);
  r.ok("live follow (second push moves further)", result.keepsMoving === true);
  r.ok("negative (real scroll did NOT bounce)", result.negativePulled === false);

  r.finish();
});
