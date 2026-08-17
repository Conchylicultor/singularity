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

/**
 * A round is only evidence against the search if the search was asked the same
 * question twice.
 *
 * `no-convergence` fires when the placement is still moving after the round
 * budget, and the fault's remedy takes a cramped layout and stops deciding. It
 * was firing on ordinary healthy panes, because the counter was reset by
 * exactly two things — a settled answer and a surrender re-arm — and by nothing
 * that happens when the row itself changes. An occupant that finishes loading
 * and grows, a ladder that arrives one round after the item it belongs to, a
 * font landing: each moves the numbers the previous rounds were deciding from,
 * and each was counted as a failed round of one search.
 *
 * These are control-flow claims, not pixel ones, so jsdom is the right place for
 * them: widths come through the primitive's own measurement seam exactly as in
 * `termination.test.tsx`, and the fit, the ledger, the counters and the remedy
 * all run as they do in a browser.
 */

const TRIGGER_PX = 30;
const ROOM = 400;
/** Wide enough that three of them plus the trigger cannot fit. */
const WIDE_ITEM = 260;
const NARROW_ITEM = 100;

/** Pass counter, bumped by the root measurement at the top of every pass. */
let passes = 0;
/**
 * Until this pass, occupants measure differently every round — a widget still
 * settling. After it, they hold still.
 */
let settlesAtPass = 0;
/**
 * The row is being dragged as well.
 *
 * Load-bearing for every test here that expects a fault: at a row holding its
 * width, H2 bars a rung whose committed promotion was measured and undone until
 * the row is genuinely wider, so the placement runs out of moves and settles
 * even while the occupants' widths keep moving. Only a row that is ALSO moving
 * keeps un-barring those rungs — a pane being dragged while its widgets are
 * still resizing themselves.
 */
let rowMoves = false;
let faults: AdaptiveBarFault[] = [];

/**
 * The row's width, as a host that GIVES a width would report it.
 *
 * The slack probe reads the root twice in one pass — once holding the occupants
 * and once with them hidden — so a fake that advanced its drag between those two
 * reads would be describing a row whose width follows its own content. That is
 * `no-slack`, a different fault entirely.
 */
function measureRow(root: Element): number {
  const holdsSomething = [
    ...root.querySelectorAll<HTMLElement>("[data-adaptive-bar-item]"),
  ].some((c) => c.parentElement === root && !c.hidden);
  if (holdsSomething) passes += 1;
  return rowMoves ? ROOM + (passes % 2) * 40 : ROOM;
}

function measureFake(el: Element): number {
  if (el.hasAttribute("data-adaptive-bar-trigger")) return TRIGGER_PX;
  const id = el.getAttribute("data-adaptive-bar-item");
  if (id === null) return measureRow(el);
  if (el.childElementCount === 0) return 0;
  if (passes >= settlesAtPass) return NARROW_ITEM;
  return passes % 2 === 0 ? NARROW_ITEM : WIDE_ITEM;
}

function Probe({ id }: { id: string }): ReactElement {
  useActionForm({ shrinksTo: ["compact"] });
  return <span data-probe={id}>{id}</span>;
}

function Bar({
  overflow,
}: {
  overflow?: "panel" | "clip" | "scroll";
}): ReactElement {
  return (
    // A fresh arrow every render, so a re-render re-runs the pass — the stand-in
    // for the ResizeObserver, which cannot fire in jsdom.
    <AdaptiveBarMeasure measure={(el) => measureFake(el)}>
      <AdaptiveBar gap="xs" label="Settling" overflow={overflow}>
        {["alpha", "beta", "gamma"].map((id) => (
          <AdaptiveBar.Item key={id} id={id}>
            <Probe id={id} />
          </AdaptiveBar.Item>
        ))}
      </AdaptiveBar>
    </AdaptiveBarMeasure>
  );
}

/** Every occupant container, and the dock it currently sits in. */
function containers(): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>("[data-adaptive-bar-item]"),
  ];
}

beforeEach(() => {
  passes = 0;
  settlesAtPass = 0;
  rowMoves = false;
  faults = [];
  // The production path is the one under test: in dev `failLoudly` throws, which
  // unmounts the tree and hides what the bar does NEXT.
  vi.stubEnv("DEV", false);
  adaptiveBarReportSink.register((fault) => faults.push(fault));
});

afterEach(() => {
  adaptiveBarReportSink.register(null);
  vi.unstubAllEnvs();
  cleanup();
});

describe("a premise that moves and then holds", () => {
  it("does not spend the round budget while the widths are still settling", () => {
    // Eight rounds of moving widths — twice the old fixed budget of four, and
    // the shape of an ordinary cold start where several occupants finish loading
    // one after another. Every one of those rounds used to count as a failed
    // round of one search.
    settlesAtPass = 8;
    const { rerender } = render(<Bar />);
    for (let i = 0; i < 6; i += 1) rerender(<Bar />);

    expect(faults).toEqual([]);
  });

  it("still stops a bar whose premise never settles, and says what moved", () => {
    settlesAtPass = Number.POSITIVE_INFINITY;
    rowMoves = true;
    render(<Bar />);

    expect(faults.length).toBeGreaterThan(0);
    expect(faults.every((f) => f.kind === "no-convergence")).toBe(true);
    const evidence = faults[0]?.evidence;
    expect(evidence).toBeDefined();
    // The whole point of the evidence: the next reader does not have to
    // reproduce a transient to learn which occupant moved underneath the fit.
    expect(evidence?.moved.length).toBeGreaterThan(0);
    expect(["alpha", "beta", "gamma"]).toContain(evidence?.moved[0]?.id);
    expect(evidence?.moved[0]?.from).not.toBe(evidence?.moved[0]?.to);
    // And the other half of the finding: the row was moving too, so a reader
    // knows the page was being resized underneath rather than the bar failing
    // at a width that held still.
    expect(evidence?.widths.length).toBeGreaterThan(1);
  });

  it("names the bar by what composed it, not only by its label", () => {
    settlesAtPass = Number.POSITIVE_INFINITY;
    rowMoves = true;
    render(<Bar />);

    const fault = faults[0];
    expect(fault?.label).toBe("Settling");
    // No UI-context lineage above a bare test render, so there is nothing to
    // report — and the field is absent rather than a fabricated name.
    expect(fault?.origin).toBeUndefined();
    // The mode is always knowable, and on its own it separates two bars that
    // share the default label.
    expect(fault?.overflow).toBe("panel");
  });
});

describe("what a surrendered bar commits", () => {
  it("keeps the occupants it measured as fitting, rather than taking the floor", () => {
    settlesAtPass = Number.POSITIVE_INFINITY;
    rowMoves = true;
    render(<Bar />);

    expect(faults.length).toBeGreaterThan(0);
    // Three 100px occupants fit 400px of row, and the search said so on every
    // other round. The floor would have put all three in the `⋯` panel for a
    // fault that is frequently transient; the best answer the search actually
    // produced is both wider and one the fit vouched for.
    const inline = containers().filter(
      (c) => c.parentElement?.hasAttribute("data-adaptive-bar-anchor") !== true,
    );
    expect(inline.length).toBeGreaterThan(0);
    // And nothing was lost or duplicated on the way.
    for (const id of ["alpha", "beta", "gamma"]) {
      expect(
        document.querySelectorAll(`[data-adaptive-bar-item="${id}"]`),
      ).toHaveLength(1);
    }
  });

  it("never empties a clip bar's row on the way out", () => {
    // `clip` drops its evictions into a hidden parking dock, so a floor that
    // evicts hides EVERY occupant the bar holds — strictly worse than the
    // clipping that mode already accepts, and for a fault whose premise is "my
    // width reading is honest". Clipping some of them is that mode working;
    // clipping all of them is the bar giving up on its own row.
    settlesAtPass = Number.POSITIVE_INFINITY;
    rowMoves = true;
    render(<Bar overflow="clip" />);

    expect(faults.length).toBeGreaterThan(0);
    const shown = containers().filter((c) => c.parentElement?.hidden !== true);
    expect(shown.length).toBeGreaterThan(0);
  });
});
