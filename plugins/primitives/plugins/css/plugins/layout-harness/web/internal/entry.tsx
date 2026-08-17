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
import { expandRegionFixtures } from "./expand-region-fixtures";
import { RAIL_MARKER_ATTR } from "./region-children";
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

function px(value: string): number {
  const n = parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
}

/** Where a box's CONTENT starts. See `MeasuredFixture["slots"]`. */
function contentLeftOf(el: HTMLElement): number {
  return el.getBoundingClientRect().left + px(getComputedStyle(el).paddingLeft);
}

// A rail this large is not a rail — it is the marker saying the property was
// never published, arriving as `var()`'s fallback so "unpublished" and "0px"
// stay distinguishable. Padding cannot be negative, so a negative sentinel would
// collapse back to 0 and lose exactly that distinction.
const RAIL_UNPUBLISHED_SENTINEL = 99_999;

/**
 * Resolve `--rail-start` / `--rail-end` to PIXELS as `host` sees them.
 *
 * By laying them out, never by parsing the computed text: the ramp declares
 * `--rail-start: var(--space-lg)`, whose computed value is the string `1rem`,
 * and control-panel's rails are `calc()` chains. `parseFloat` reads `1` and
 * `NaN` respectively — a rail that is wrong by a factor of 16, silently. Same
 * probe idiom as `ui-kit/e2e/scroll-fade-verify.ts`.
 */
function resolveRail(host: HTMLElement): {
  start: number | null;
  end: number | null;
} {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:-999999px;left:-999999px;visibility:hidden;width:0";
  host.appendChild(probe);
  const lengthOf = (name: string): number | null => {
    probe.style.height = `var(${name}, ${RAIL_UNPUBLISHED_SENTINEL}px)`;
    const h = probe.getBoundingClientRect().height;
    return Math.abs(h - RAIL_UNPUBLISHED_SENTINEL) < 0.5 ? null : h;
  };
  const start = lengthOf("--rail-start");
  const end = lengthOf("--rail-end");
  probe.remove();
  return { start, end };
}

/**
 * Find the box that PUBLISHED the rail the marker sees, walking up from the
 * marker to (and including) the container.
 *
 * Custom properties inherit, so the marker's computed `--rail-start` is shared
 * by every ancestor from the publisher down. The publisher is therefore the
 * OUTERMOST ancestor still reporting that same value — one step further up the
 * value changes (or disappears), because that is where the declaration is.
 *
 * Why bother, rather than measuring from the container: the rail is an offset
 * from the publisher's PADDING box, and the publisher is usually not the
 * harness's width wrapper. A bordered region (an `OverlayPanel`) sits one pixel
 * inside it, and a region rendered inside its own chrome sits further in still —
 * measuring from the wrapper would report every child as off-by-the-chrome.
 *
 * Boxless elements are never chosen as the host: the marker itself is
 * `display: contents`, and `railOverride` publishes ON the marker, so without
 * this the mutated run would resolve its origin to a 0×0 rect at the viewport
 * origin and "fail" for a reason unrelated to the rail.
 */
function railHostOf(
  marker: HTMLElement,
  containerEl: HTMLElement,
): HTMLElement {
  const published = getComputedStyle(marker).getPropertyValue("--rail-start");
  let host: HTMLElement | null = null;
  for (
    let el: HTMLElement | null = marker;
    el !== null && (el === containerEl || containerEl.contains(el));
    el = el.parentElement
  ) {
    if (getComputedStyle(el).getPropertyValue("--rail-start") !== published)
      break;
    if (el.getClientRects().length > 0) host = el;
    if (el === containerEl) break;
  }
  return host ?? containerEl;
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
          throw new Error(
            'swapLeafDisplay:"inline" mutation: no `[data-geo="content"]` leaf found',
          );
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
        const indicator = scope.querySelector<HTMLElement>(
          '[data-geo="indicator"]',
        );
        const content = scope.querySelector<HTMLElement>(
          '[data-geo="content"]',
        );
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
    case "railOverride": {
      // Re-publish the rail from the harness's own marker — BELOW the region,
      // ABOVE the children. Nothing moves: the region already laid its children
      // out, and the children never read the var themselves. All that changes is
      // the number the region claims to have used.
      //
      // That is the only mutation that isolates the assertion under test. Moving
      // the children instead would also trip `noClip` and `noOverlap`, so a
      // green `railAlignment` could hide behind its neighbours; this one is
      // invisible to every other invariant, so if the falsification bites, it
      // bit HERE.
      //
      // Setting it on the region itself would not take: the cascade is per
      // element, so the region's own declaration wins on the region's own box
      // whatever an ancestor says, `!important` included.
      const marker = scope.querySelector<HTMLElement>(`[${RAIL_MARKER_ATTR}]`);
      if (!marker) {
        throw new Error(
          `railOverride mutation: no [${RAIL_MARKER_ATTR}] in the fixture subtree — railOverride only applies to region fixtures, whose children the harness itself supplies`,
        );
      }
      marker.style.setProperty("--rail-start", mutate.value);
      marker.style.setProperty("--rail-end", mutate.value);
      break;
    }
    case "railOwedOverride": {
      // Same placement, and for the same cascade reason: the region declares
      // `--rail-owed-*: 0px` on its own box (the `rail-<step>` ramp does it in
      // the same breath as the padding), so only a declaration BELOW it reaches
      // the children.
      //
      // Only a `rail-follow` child reads the debt, so this moves exactly one
      // member and leaves the rest untouched — which is what makes a red result
      // here mean "the follower double-paid" and nothing else.
      const marker = scope.querySelector<HTMLElement>(`[${RAIL_MARKER_ATTR}]`);
      if (!marker) {
        throw new Error(
          `railOwedOverride mutation: no [${RAIL_MARKER_ATTR}] in the fixture subtree — railOwedOverride only applies to region fixtures, whose children the harness itself supplies`,
        );
      }
      marker.style.setProperty("--rail-owed-start", mutate.value);
      marker.style.setProperty("--rail-owed-end", mutate.value);
      break;
    }
    case "shrinkSlots": {
      // Hand the measured boxes back to the layout engine: let it take width
      // from them when their row runs out. That is the DEFAULT for a flex item
      // (`flex: 0 1 auto`), so this mutation does not invent a broken shape so
      // much as remove a deliberate one — which is what makes it the right
      // falsification for any primitive whose contract is "a box I measure is
      // the size of its own content, whatever else is in the row".
      //
      // `min-width: 0` rides along because a flex item's automatic minimum size
      // would otherwise stop the squeeze at min-content, and a slot whose
      // content is already unsqueezable (a button, a bare string) would report
      // a false green.
      const slots = [...scope.querySelectorAll<HTMLElement>("[data-geo]")];
      if (slots.length === 0) {
        throw new Error(
          "shrinkSlots mutation: no [data-geo] boxes in the fixture subtree",
        );
      }
      for (const slot of slots) {
        slot.style.flexShrink = "1";
        slot.style.minWidth = "0";
      }
      break;
    }
  }
}

void loadFixtures().then((loaded) => {
  // Region fixtures collapse into ordinary layout fixtures here, so everything
  // below — render, measure, mutate — deals in one fixture shape.
  const fixtures = expandRegionFixtures(loaded);
  byId = new Map(fixtures.map((f) => [f.id, f]));

  window.__renderFixture = (id, width, falsify) => {
    const fixture = byId.get(id);
    if (!fixture)
      throw new Error(`__renderFixture: unknown fixture id "${id}"`);
    // The harness wrapper itself carries `data-geo="container"` (the width box).
    // A fixture that authors its OWN inner `[data-geo="container"]` is honored by
    // __measure's innermost-container precedence.
    // `data-theme-scope` alongside `data-geo-root`, on the SAME element that
    // entry.html seeds the density ramp on. app.css declares its derived tokens
    // (`--hover-fill`, the whole `--cp-*` panel geometry) at
    // `:root, [data-theme-scope]`, and most of them read a density var. Custom
    // property substitution happens where the property is DECLARED, so anchored
    // on `:root` alone — where the harness seeds nothing — every one of them
    // computes to guaranteed-invalid and inherits down invalid: a
    // `grid-template-columns: var(--cp-gutter) …` then falls back to `none` and
    // the measured grid silently collapses to one column. Marking this element a
    // theme scope makes app.css re-declare them here, against the seeded ramp,
    // so the harness reads the tokens from their single source instead of the
    // page restating them.
    const tree = createElement(
      "div",
      { "data-geo-root": "", "data-theme-scope": "" },
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
      const scope = container.querySelector<HTMLElement>(
        '[data-geo="container"]',
      );
      if (!scope)
        throw new Error("__renderFixture: container missing after render");
      applyMutation(scope, falsify);
    }
  };

  window.__measure = () => {
    // Prefer the INNERMOST `[data-geo="container"]` so a fixture that authors its
    // own container (e.g. pin/menu-indicator-over-label's relative div) measures
    // against it rather than the harness width wrapper.
    const containers = [
      ...container.querySelectorAll<HTMLElement>('[data-geo="container"]'),
    ];
    if (containers.length === 0)
      throw new Error("__measure: no [data-geo='container']");
    const containerEl = containers.reduce((innermost, el) =>
      innermost.contains(el) ? el : innermost,
    );
    const slots: MeasuredFixture["slots"] = {};
    const order: string[] = [];
    for (const el of container.querySelectorAll<HTMLElement>("[data-geo]")) {
      const key = el.getAttribute("data-geo")!;
      if (key === "container") continue;
      if (el === containerEl) continue;
      // An element that generates NO BOXES is not a geometry participant, and
      // measuring it invents one. `display:none` makes `getBoundingClientRect()`
      // all zeros, so a hidden slot would report a 0×0 box at the viewport
      // origin — which "overlaps" every sibling by its full width and "clips"
      // past every container edge. Both are artefacts of asking a
      // non-participant where it is.
      //
      // Skipping it here (rather than in each oracle rule) makes it identical to
      // a slot the fixture did not render at all, which every rule already
      // tolerates — `noOverlap` and `noClip` both skip absent slots. Any fixture
      // with a conditionally-shown affordance needs this; the adaptive bar's `⋯`
      // trigger, hidden while nothing has overflowed, was the first.
      if (el.getClientRects().length === 0) continue;
      order.push(key);
      slots[key] = {
        box: box(el),
        truncates: el.scrollWidth > el.clientWidth,
        contentLeft: contentLeftOf(el),
      };
    }
    // The rail is read where the CHILDREN read it — from inside the region, off
    // the harness's own marker — because custom properties inherit downward and
    // the region publishes on its own box, a descendant of the container. A
    // fixture that authors its own children has no marker, so the container is
    // asked instead; those fixtures assert no `railAlignment`, and the fields
    // are then simply the ambient rail, whatever it is.
    const marker = container.querySelector<HTMLElement>(
      `[${RAIL_MARKER_ATTR}]`,
    );
    const railHost = marker ? railHostOf(marker, containerEl) : containerEl;
    const rail = resolveRail(marker ?? containerEl);
    const railRect = railHost.getBoundingClientRect();
    return {
      container: box(containerEl),
      slots,
      order,
      // The padding box, not the border box: a region's border sits outside the
      // rail it publishes.
      railOrigin:
        railRect.left + px(getComputedStyle(railHost).borderLeftWidth),
      railStart: rail.start,
      railEnd: rail.end,
    };
  };

  window.__fixturesReady = true;
});
