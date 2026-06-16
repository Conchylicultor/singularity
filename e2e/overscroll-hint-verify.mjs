// Verify the overscroll-hint primitive: a wasted wheel gesture (nothing
// scrolls) should rubber-band the surface (inline translate transform); a wheel
// on a genuinely scrollable surface should not.
import { chromium } from "playwright";

const url = "http://att-1781627346-t8gu.localhost:9000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(url);
await page.waitForTimeout(4000);

const result = await page.evaluate(async () => {
  const nextFrame = () =>
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const tick = (ms) => new Promise((r) => setTimeout(r, ms));
  const pulled = (el) => /translate/.test(el.style.transform || "");

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

console.log("positive (wasted gesture rubber-banded):", result.positivePulled);
console.log("live follow (second push moves further):", result.keepsMoving);
console.log("negative (real scroll did NOT bounce):", !result.negativePulled);
const pass =
  result.positivePulled === true &&
  result.keepsMoving === true &&
  result.negativePulled === false;
console.log(pass ? "PASS" : "FAIL");
await browser.close();
process.exit(pass ? 0 : 1);
