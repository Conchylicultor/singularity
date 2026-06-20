import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { createElement } from "react";
import {
  loadFixtures,
  type FixtureMutation,
  type LayoutFixture,
  type MeasuredBox,
  type MeasuredFixture,
} from "@plugins/primitives/plugins/css/plugins/layout-harness/core";
// The ONLY place the real Tailwind stylesheet is imported — the fixtures
// themselves never import it (so they stay Bun-safe). Bundling it here means the
// measured page paints with the exact tokens/utilities the live app uses.
import "@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/app.css";

// ── The browser side of the geometry harness ────────────────────────
//
// This module is bundled by `build-fixtures-page.ts` (Vite + React + Tailwind)
// into a static page loaded by Playwright. It exposes two globals the measure
// driver calls per (fixture, width):
//
//   window.__renderFixture(id, width, falsify?) → mount the fixture at `width`,
//       optionally applying a falsification mutation to the painted DOM.
//   window.__measure() → read the `[data-geo]` boxes into a MeasuredFixture.
//
// The width axis is a styled wrapper, NOT a viewport resize: one loaded page
// re-renders per width via these globals (no reload per width). The `window`
// globals are typed in the ambient `harness-globals.d.ts`.

const container = document.getElementById("root")!;
let root: Root | null = null;
let byId: Map<string, LayoutFixture> = new Map();

function ensureRoot(): Root {
  if (!root) root = createRoot(container);
  return root;
}

function box(el: Element): MeasuredBox {
  const r = el.getBoundingClientRect();
  return {
    left: r.left,
    right: r.right,
    top: r.top,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  };
}

/**
 * Apply a falsification mutation to the painted DOM, inside `scope` (the
 * harness container). The mutations reproduce the historical broken constructs
 * so the suite can prove the oracle bites on the wrong shape.
 */
function applyMutation(scope: HTMLElement, mutate: FixtureMutation): void {
  switch (mutate.kind) {
    case "templateOverride": {
      // Find the grid root (the Frame's `display:grid` element) and force a wrong
      // track function — reproduces a wrong grid-template-columns (e.g. the
      // weighted 3fr/1fr split that starves `meta`, inverting truncation onset).
      const grid = [...scope.querySelectorAll<HTMLElement>("*")].find(
        (el) => getComputedStyle(el).display === "grid",
      );
      if (!grid) {
        throw new Error(
          "templateOverride mutation: no `display:grid` element found in the fixture subtree",
        );
      }
      grid.style.gridTemplateColumns = mutate.value;
      break;
    }
    case "swapLeafDisplay": {
      if (mutate.value === "inline") {
        // The original single-line-leaf bug: a plain inline leaf silently no-ops
        // `overflow`/`text-overflow`, so the text lays out at full width and
        // overflows its block parent → `noClip` is violated.
        const leaf = scope.querySelector<HTMLElement>('[data-geo="content"]');
        if (!leaf) {
          throw new Error('swapLeafDisplay:"inline" mutation: no `[data-geo="content"]` leaf found');
        }
        leaf.style.display = "inline";
        leaf.style.maxWidth = "none";
        leaf.style.overflow = "visible";
        break;
      }
      if (mutate.value === "absolute-pad") {
        // The old menu-indicator construct: float the checkmark indicator
        // `absolute` over the row and reserve space with right-padding — only a
        // hint the flexible label can ignore, so a long label slides UNDER the
        // indicator. We pull the indicator out of the grid flow (so its rigid
        // `trailing` track collapses to 0) and stretch the content leaf across
        // the full row width under it → `content.right > indicator.left` →
        // `noOverlap` is genuinely violated (measured boxes overlap).
        const indicator = scope.querySelector<HTMLElement>('[data-geo="indicator"]');
        const content = scope.querySelector<HTMLElement>('[data-geo="content"]');
        const grid = [...scope.querySelectorAll<HTMLElement>("*")].find(
          (el) => getComputedStyle(el).display === "grid",
        );
        if (!indicator || !content || !grid) {
          throw new Error(
            'swapLeafDisplay:"absolute-pad" mutation: need `[data-geo="indicator"]`, `[data-geo="content"]`, and a grid root',
          );
        }
        // Collapse the indicator's rigid grid cell to 0 and pull the indicator
        // out of flow (absolute over the row's right edge with a fixed offset),
        // so the content track spans the whole row — the old reservation-padding
        // shape where the absolute indicator only hints space the flexible label
        // ignores.
        grid.style.gridTemplateColumns = "1fr 0";
        grid.style.position = "relative";
        indicator.style.position = "absolute";
        indicator.style.right = "8px";
        indicator.style.top = "8px";
        // Force the content leaf to render its full intrinsic width (no
        // truncation) so its right edge genuinely overruns the absolute
        // indicator's left edge → measured boxes overlap.
        content.style.maxWidth = "none";
        content.style.overflow = "visible";
        content.style.whiteSpace = "nowrap";
        content.style.display = "inline-block";
        break;
      }
      throw new Error(`swapLeafDisplay: unsupported value "${mutate.value}"`);
    }
  }
}

void loadFixtures().then((fixtures) => {
  byId = new Map(fixtures.map((f) => [f.id, f]));

  window.__renderFixture = (id, width, falsify) => {
    const fixture = byId.get(id);
    if (!fixture) throw new Error(`__renderFixture: unknown fixture id "${id}"`);
    // The harness wrapper itself carries `data-geo="container"` (the width box).
    // A fixture that authors its OWN inner `[data-geo="container"]` is honored by
    // __measure's innermost-container precedence.
    const tree = createElement(
      "div",
      { "data-geo-root": "" },
      createElement(
        "div",
        { "data-geo": "container", style: { width, position: "relative" } },
        fixture.render(),
      ),
    );
    // flushSync so the subtree is committed synchronously; __measure (called
    // after a rAF tick from the driver) then sees the final layout.
    flushSync(() => ensureRoot().render(tree));
    if (falsify) {
      const scope = container.querySelector<HTMLElement>('[data-geo="container"]');
      if (!scope) throw new Error("__renderFixture: container missing after render");
      applyMutation(scope, falsify);
    }
  };

  window.__measure = () => {
    // Prefer the INNERMOST `[data-geo="container"]` so a fixture that authors its
    // own container (e.g. pin/menu-indicator-over-label's relative div) measures
    // against it rather than the harness width wrapper.
    const containers = [...container.querySelectorAll<HTMLElement>('[data-geo="container"]')];
    if (containers.length === 0) throw new Error("__measure: no [data-geo='container']");
    const containerEl = containers.reduce((innermost, el) =>
      innermost.contains(el) ? el : innermost,
    );
    const slots: MeasuredFixture["slots"] = {};
    const order: string[] = [];
    for (const el of container.querySelectorAll<HTMLElement>("[data-geo]")) {
      const key = el.getAttribute("data-geo")!;
      if (key === "container") continue;
      if (el === containerEl) continue;
      order.push(key);
      slots[key] = { box: box(el), truncates: el.scrollWidth > el.clientWidth };
    }
    return { container: box(containerEl), slots, order };
  };

  window.__fixturesReady = true;
});
