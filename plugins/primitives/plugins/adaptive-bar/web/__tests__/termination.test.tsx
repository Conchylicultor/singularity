import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import {
  AdaptiveBar,
  AdaptiveBarMeasure,
  adaptiveBarReportSink,
  type AdaptiveBarFault,
} from "../index";
import { MAX_SURRENDERS } from "../internal/diagnostics";

/**
 * A fault must cost a report and a cramped row — never a render loop, and never
 * a toolbar parked at its floor forever.
 *
 * Both halves were bugs. Debug → Layout Lab rendered nothing but a crash banner
 * because a fault committed the floor and went straight back to deciding: the
 * floor changes the placement, a changed placement re-runs the
 * measure-and-decide effect, the fit recomputes the same answer (it is
 * deliberately current-state-independent apart from pins and hysteresis), and
 * the same fault fires again. Neither counter could stop it — the convergence
 * branch and `commitFloor` both reset `passesRef`, so `MAX_PASSES` was counting
 * a number being zeroed underneath it — and React threw "maximum update depth
 * exceeded", taking the pane down over a layout disagreement.
 *
 * The obvious fix, surrendering for the life of the mount, then went too far the
 * other way: `no-convergence` fires on ordinary healthy panes (a font landing
 * mid-pass, a late icon), and parking such a bar at its floor buries every
 * action in the `⋯` panel until the pane is reopened. So surrender is scoped to
 * the WIDTH it happened at, capped by `MAX_SURRENDERS`.
 *
 * jsdom is the right place for all of this despite having no layout engine,
 * because the claims are about CONTROL FLOW ("did the bar stop asking?"), not
 * pixels. Widths come through the primitive's own measurement seam, exactly as
 * in `relocation.test.tsx`; the fit, the cache, the pass counter and the floor
 * all run as they do in a browser.
 */

const TRIGGER_PX = 30;
const ROOM = 400;
/** Narrow enough that three occupants plus the trigger cannot fit. */
const WIDE_ITEM = 260;
const NARROW_ITEM = 100;

/** What the row measures. Only a test changes it — this is a "resize". */
let rootWidth = ROOM;
/**
 * When true, the OCCUPANTS' widths flip every pass while the row holds still.
 *
 * That is the real shape of a non-convergence — a widget whose rendered width
 * moves under the fit — and it is the only way to exercise "the bar surrendered
 * and the row did NOT resize", which is the state the original crash lived in.
 */
let flipItems = false;
/** Pass counter, bumped by the root measurement at the top of every pass. */
let passes = 0;
/** Every measurement, of anything. The loop detector. */
let measurements = 0;

function measureFake(el: Element): number {
  measurements += 1;
  if (el.hasAttribute("data-adaptive-bar-trigger")) return TRIGGER_PX;
  const id = el.getAttribute("data-adaptive-bar-item");
  if (id === null) {
    passes += 1;
    return rootWidth;
  }
  // An occupant that rendered nothing is absent, not zero-width — the primitive
  // reads that from the DOM, so the fake has nothing to say about it.
  if (el.childElementCount === 0) return 0;
  if (!flipItems) return NARROW_ITEM;
  return passes % 2 === 0 ? NARROW_ITEM : WIDE_ITEM;
}

const faults: AdaptiveBarFault[] = [];

function Bar(): ReactElement {
  return (
    // A fresh arrow every render, so a re-render re-runs the pass — the stand-in
    // for the ResizeObserver, which cannot fire in jsdom.
    <AdaptiveBarMeasure measure={(el) => measureFake(el)}>
      <AdaptiveBar gap="xs" label="Oscillating">
        <AdaptiveBar.Item id="alpha">
          <span>alpha</span>
        </AdaptiveBar.Item>
        <AdaptiveBar.Item id="beta">
          <span>beta</span>
        </AdaptiveBar.Item>
        <AdaptiveBar.Item id="gamma">
          <span>gamma</span>
        </AdaptiveBar.Item>
      </AdaptiveBar>
    </AdaptiveBarMeasure>
  );
}

beforeEach(() => {
  passes = 0;
  measurements = 0;
  rootWidth = ROOM;
  flipItems = true;
  faults.length = 0;
  // The production path is the one under test: in dev `failLoudly` throws, which
  // unmounts the tree and hides the very thing this asserts — what the bar does
  // NEXT. Registering the sink is also how the fault becomes observable at all;
  // with nothing registered `emit` is a deliberate no-op.
  vi.stubEnv("DEV", false);
  adaptiveBarReportSink.register((fault) => faults.push(fault));
});

afterEach(() => {
  adaptiveBarReportSink.register(null);
  vi.unstubAllEnvs();
  cleanup();
});

describe("a fault stops the bar", () => {
  it("reports once and stops deciding while the row holds its width", () => {
    const { rerender } = render(<Bar />);

    expect(faults.map((f) => f.kind)).toEqual(["no-convergence"]);

    // The crash, restated as an assertion. Every re-render re-runs the pass, and
    // a surrendered bar at an unchanged width answers by docking alone — so it
    // never decides, never re-floors, and cannot report a second time. Before
    // the fix this is precisely where React ran out of nested updates.
    const settled = measurements;
    for (let i = 0; i < 10; i += 1) rerender(<Bar />);

    expect(faults).toHaveLength(1);
    // One cheap root probe per pass is all a stopped bar costs: it has to read
    // the width to know whether the premise it failed under still holds.
    expect(measurements - settled).toBeLessThanOrEqual(10);
  });

  it("re-arms on a genuine resize instead of staying floored", () => {
    // The regression the width scope exists to prevent: a transient
    // non-convergence must not cost the user their toolbar until they reopen
    // the pane.
    const { rerender } = render(<Bar />);
    expect(faults).toHaveLength(1);

    // The widths stop moving AND the row genuinely resizes — a new premise, so
    // re-deriving is legitimate.
    flipItems = false;
    rootWidth = ROOM * 3;
    const before = measurements;
    rerender(<Bar />);

    // It measured its occupants again, not just the root probe.
    expect(measurements).toBeGreaterThan(before + 1);
    // And with room for everything and stable widths, it converges and settles.
    expect(faults).toHaveLength(1);
  });

  it("gives up for good once it has given up MAX_SURRENDERS times", () => {
    // The adversarial case for the re-arm: a row whose width changes on every
    // single pass, so every pass looks like a resize and the bar is invited to
    // try again forever. The cap is the guarantee that does not rest on "a floor
    // commit cannot change the bar's own width".
    const { rerender } = render(<Bar />);
    for (let i = 0; i < 30; i += 1) {
      rootWidth = i % 2 === 0 ? ROOM : ROOM * 2;
      rerender(<Bar />);
    }

    expect(faults.length).toBeLessThanOrEqual(MAX_SURRENDERS);
    expect(faults.every((f) => f.kind === "no-convergence")).toBe(true);

    const cappedAt = faults.length;
    for (let i = 0; i < 10; i += 1) {
      rootWidth = i % 2 === 0 ? ROOM : ROOM * 2;
      rerender(<Bar />);
    }
    expect(faults).toHaveLength(cappedAt);
  });

  it("keeps every occupant reachable after surrendering", () => {
    render(<Bar />);

    // The floor is "every unpinned occupant at its narrowest rung", which for
    // occupants with no smaller form means the panel. Cramped is the point;
    // LOST would not be — each is still mounted, exactly once, in its own
    // container.
    for (const id of ["alpha", "beta", "gamma"]) {
      expect(
        document.querySelectorAll(`[data-adaptive-bar-item="${id}"]`),
      ).toHaveLength(1);
    }
  });
});
