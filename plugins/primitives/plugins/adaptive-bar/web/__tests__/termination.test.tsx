import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { useActionForm } from "@plugins/primitives/plugins/action-presentation/web";
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
 * branch and the commit both reset the round counter, so the budget counted a
 * number being zeroed underneath it — and React threw "maximum update depth
 * exceeded", taking the pane down over a layout disagreement.
 *
 * The obvious fix, surrendering for the life of the mount, then went too far the
 * other way, so surrender is scoped to the WIDTH it happened at and capped by
 * {@link MAX_SURRENDERS}.
 *
 * **What can actually fail to settle**, and it is worth knowing before writing a
 * fixture for this: at a row that holds its width, nothing can. H2 bars a rung
 * whose committed promotion was measured and undone until the row is genuinely
 * wider, so an oscillation at one width runs out of moves within a round or two
 * — even when the occupants' own widths keep moving. What defeats that is a row
 * whose width ALSO keeps changing, because every width change un-bars those
 * rungs. Hence the fake below: a pane being dragged while its widgets are still
 * resizing themselves.
 *
 * jsdom is the right place for all of this despite having no layout engine,
 * because the claims are about CONTROL FLOW ("did the bar stop asking?"), not
 * pixels. Widths come through the primitive's own measurement seam, exactly as
 * in `relocation.test.tsx`; the fit, the ledger, the counters and the remedy all
 * run as they do in a browser.
 */

const TRIGGER_PX = 30;
const ROOM = 400;
/** Wide enough that three occupants plus the trigger cannot fit. */
const WIDE_ITEM = 260;
const NARROW_ITEM = 100;

/** What the row measures when nothing is churning. */
let rootWidth = ROOM;
/** The row AND its occupants measure differently every pass. */
let churn = false;
/** Pass counter, bumped by the root measurement at the top of every pass. */
let passes = 0;
/** Every measurement, of anything. The loop detector. */
let measurements = 0;

/**
 * The row's width, as a host that GIVES a width would report it.
 *
 * A pass reads the root twice when the slack probe runs — once with the
 * occupants in the row and once with them hidden — and a fake that advanced its
 * drag between those two reads would be reporting a width that follows its own
 * content, which is `no-slack`, not the thing under test. So the drag advances
 * only on a read taken while the row is still holding something.
 */
function measureRow(root: Element): number {
  const holdsSomething = [
    ...root.querySelectorAll<HTMLElement>("[data-adaptive-bar-item]"),
  ].some((c) => c.parentElement === root && !c.hidden);
  if (holdsSomething) passes += 1;
  return churn ? rootWidth + (passes % 2) * 40 : rootWidth;
}

function measureFake(el: Element): number {
  measurements += 1;
  if (el.hasAttribute("data-adaptive-bar-trigger")) return TRIGGER_PX;
  const id = el.getAttribute("data-adaptive-bar-item");
  if (id === null) return measureRow(el);
  // An occupant that rendered nothing is absent, not zero-width — the primitive
  // reads that from the DOM, so the fake has nothing to say about it.
  if (el.childElementCount === 0) return 0;
  if (!churn) return NARROW_ITEM;
  return passes % 2 === 0 ? NARROW_ITEM : WIDE_ITEM;
}

const faults: AdaptiveBarFault[] = [];

/**
 * An occupant with a compact form, because a row of occupants that can only
 * leave or stay runs out of moves too quickly to model anything: H2 bars the
 * rung of a failed promotion, and with one rung apiece that is the whole search.
 */
function Probe({ id }: { id: string }): ReactElement {
  useActionForm({ shrinksTo: ["compact"] });
  return <span>{id}</span>;
}

function Bar(): ReactElement {
  return (
    // A fresh arrow every render, so a re-render re-runs the pass — the stand-in
    // for the ResizeObserver, which cannot fire in jsdom.
    <AdaptiveBarMeasure measure={(el) => measureFake(el)}>
      <AdaptiveBar gap="xs" label="Oscillating">
        <AdaptiveBar.Item id="alpha">
          <Probe id="alpha" />
        </AdaptiveBar.Item>
        <AdaptiveBar.Item id="beta">
          <Probe id="beta" />
        </AdaptiveBar.Item>
        <AdaptiveBar.Item id="gamma">
          <Probe id="gamma" />
        </AdaptiveBar.Item>
      </AdaptiveBar>
    </AdaptiveBarMeasure>
  );
}

beforeEach(() => {
  passes = 0;
  measurements = 0;
  rootWidth = ROOM;
  churn = true;
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
  it("reports, and then stops deciding once the churn stops", () => {
    const { rerender } = render(<Bar />);

    expect(faults.length).toBeGreaterThan(0);
    expect(faults.every((f) => f.kind === "no-convergence")).toBe(true);

    // The crash, restated as an assertion. With nothing moving, a surrendered
    // bar at an unchanged width answers by docking alone — so it never decides,
    // never re-commits, and cannot report again. Before the fix this is
    // precisely where React ran out of nested updates.
    churn = false;
    rerender(<Bar />);
    const settled = measurements;
    const filed = faults.length;
    for (let i = 0; i < 10; i += 1) rerender(<Bar />);

    expect(faults).toHaveLength(filed);
    // A couple of cheap probes per pass is all a stopped bar costs: it has to
    // read the width to know whether the premise it failed under still holds.
    expect(measurements - settled).toBeLessThanOrEqual(40);
  });

  it("re-arms on a genuine resize instead of staying floored", () => {
    // The regression the width scope exists to prevent: a transient
    // non-convergence must not cost the user their toolbar until they reopen
    // the pane.
    const { rerender } = render(<Bar />);
    expect(faults.length).toBeGreaterThan(0);

    // The widths stop moving AND the row genuinely resizes — a new premise, so
    // re-deriving is legitimate.
    churn = false;
    rootWidth = ROOM * 3;
    const before = measurements;
    rerender(<Bar />);

    // It measured its occupants again, not just the root probe.
    expect(measurements).toBeGreaterThan(before + 1);
  });

  it("gives up for good once it has given up MAX_SURRENDERS times", () => {
    // The adversarial case for the re-arm: a row whose width changes on every
    // single pass, so every pass looks like a resize and the bar is invited to
    // try again forever. The cap is the guarantee that does not rest on "a
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

    // Whatever a surrendered bar commits — the best placement its search
    // measured as fitting, or the floor when it produced none — nothing may be
    // LOST. Each occupant is still mounted, exactly once, in its own container,
    // wherever that container currently sits.
    for (const id of ["alpha", "beta", "gamma"]) {
      expect(
        document.querySelectorAll(`[data-adaptive-bar-item="${id}"]`),
      ).toHaveLength(1);
    }
  });
});

describe("a row that holds its width", () => {
  it("settles even while its occupants keep resizing themselves", () => {
    // The property that makes the fixture above necessary, stated: H2 bars a
    // rung whose promotion failed until the row is genuinely wider, so a fixed
    // width runs the oscillation out of moves. Widths that move under a still
    // row are not a fault — the placement stops changing, which is all the bar
    // ever promised.
    let flip = 0;
    render(
      <AdaptiveBarMeasure
        measure={(el) => {
          if (el.hasAttribute("data-adaptive-bar-trigger")) return TRIGGER_PX;
          if (!el.hasAttribute("data-adaptive-bar-item")) return ROOM;
          if (el.childElementCount === 0) return 0;
          flip += 1;
          return flip % 2 === 0 ? NARROW_ITEM : WIDE_ITEM;
        }}
      >
        <AdaptiveBar gap="xs" label="Still">
          <AdaptiveBar.Item id="alpha">
            <Probe id="alpha" />
          </AdaptiveBar.Item>
          <AdaptiveBar.Item id="beta">
            <Probe id="beta" />
          </AdaptiveBar.Item>
        </AdaptiveBar>
      </AdaptiveBarMeasure>,
    );

    expect(faults).toEqual([]);
  });
});
