import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { type ReactElement } from "react";
import { useActionForm } from "@plugins/primitives/plugins/action-presentation/web";
import {
  AdaptiveBar,
  AdaptiveBarMeasure,
  adaptiveBarReportSink,
} from "../index";
import type { AdaptiveBarFault } from "../index";
import { MAX_SLACK_PROBES, MAX_ZERO_RECOVERIES } from "../internal/diagnostics";

/**
 * The host contract, as a test.
 *
 * `available` is the one input the fit math cannot check for itself, and the way
 * it goes wrong is not "too small" — it is a host whose own width is derived
 * from the bar's content. Every eviction then shrinks the number that decides
 * the next one, and the row ratchets itself empty. That shape is what shipped in
 * the conversation prompt bar, and no proxy caught it: the bar declares
 * `flex-1` on itself, and a parent that shrink-wraps to its child is never
 * overshot by it.
 *
 * jsdom has no layout engine, so the shrink-wrapping host is modelled through
 * the primitive's own measurement seam — the same seam the fit tests use. The
 * guard reads widths through it too, which is exactly why it is expressible
 * here rather than only in a browser.
 */

const ITEM_PX = 100;
/** The most the host could ever give, if it gave slack at all. */
const CAP_PX = 250;

/** A host that shrink-wraps to whatever the row is currently holding. */
function shrinkWrappingMeasure(el: Element): number {
  if (el.hasAttribute("data-adaptive-bar-trigger")) return 30;
  if (el.hasAttribute("data-adaptive-bar-item")) {
    return (el as HTMLElement).hidden ? 0 : ITEM_PX;
  }
  // The row: its width IS its content, capped by the room the page has.
  const inline = [
    ...el.querySelectorAll<HTMLElement>("[data-adaptive-bar-item]"),
  ].filter((c) => c.parentElement === el && !c.hidden);
  return Math.min(CAP_PX, inline.length * ITEM_PX);
}

function Probe({ id }: { id: string }): ReactElement {
  useActionForm();
  return <span data-probe={id}>{id}</span>;
}

function Row(): ReactElement {
  return (
    <AdaptiveBarMeasure measure={shrinkWrappingMeasure}>
      <AdaptiveBar gap="xs" label="Actions" overflow="clip">
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

function inlineCount(): number {
  return [
    ...document.querySelectorAll<HTMLElement>("[data-adaptive-bar-item]"),
  ].filter((c) => c.parentElement?.hidden !== true).length;
}

afterEach(() => {
  cleanup();
  adaptiveBarReportSink.register(null);
  vi.unstubAllEnvs();
});

describe("a host whose width follows the bar's content", () => {
  it("faults and keeps every occupant in the row, instead of ratcheting it empty", () => {
    // Production behaviour: file the alert and take the layout that hides
    // nothing. In dev the same fault throws, which is asserted below.
    vi.stubEnv("DEV", false);
    const faults: AdaptiveBarFault[] = [];
    adaptiveBarReportSink.register((f) => {
      faults.push(f);
    });

    render(<Row />);

    expect(faults.map((f) => f.kind)).toEqual(["no-slack"]);
    // Three occupants want 300px of a row that will never admit more than 250,
    // so an unguarded bar evicts — and each eviction shrinks the width that
    // decided it. Everything stays in the row and CSS clips instead.
    expect(inlineCount()).toBe(3);
  });

  it("throws in dev, where a layout the bar cannot trust must not be lived with", () => {
    vi.stubEnv("DEV", true);
    expect(() => render(<Row />)).toThrow(/adaptive-bar \(Actions\)/);
  });
});

describe("a host that hands the bar a width", () => {
  it("stays silent and fits the row as usual", () => {
    vi.stubEnv("DEV", false);
    const faults: AdaptiveBarFault[] = [];
    adaptiveBarReportSink.register((f) => {
      faults.push(f);
    });

    render(
      <AdaptiveBarMeasure
        measure={(el) => {
          if (el.hasAttribute("data-adaptive-bar-trigger")) return 30;
          if (el.hasAttribute("data-adaptive-bar-item")) {
            return (el as HTMLElement).hidden ? 0 : ITEM_PX;
          }
          return CAP_PX; // given, not derived
        }}
      >
        <AdaptiveBar gap="xs" label="Actions" overflow="clip">
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
      </AdaptiveBarMeasure>,
    );

    expect(faults).toEqual([]);
    // 250px of row, 100px each: the third is clipped out of it, and that is the
    // primitive working rather than failing.
    expect(inlineCount()).toBe(2);
  });
});

/**
 * The premise belongs to the HOST, and a host can change under a mounted bar.
 *
 * A framing variant swaps, a wrapper's class flips, contributions arrive in a
 * later plugin wave, or a shrink-to-content ancestor whose width was floored by
 * a wider sibling stops being floored once the bar's own content grows past it.
 * A guard spent at mount is spent before any of that, so the ratchet it exists
 * to catch runs unobserved — and the surrender re-arm's own termination
 * argument rests on this premise having been verified.
 *
 * The re-ask follows the row NARROWING, because that is the direction the fault
 * manifests in, and it is budgeted, because a narrowing drag produces one every
 * frame and each probe is a forced reflow.
 */

/** Bumped by every root read that is not a probe — once per deciding pass. */
let passes = 0;
/**
 * Root reads taken while the row holds only hidden occupants: the probe's
 * signature, and the one way a test can count probes without the bar being
 * asked to report them.
 */
let probes = 0;
/** What a host that GIVES a width hands the row. The tests narrow it. */
let givenPx = 0;
/** Once true, the host stops giving a width and starts taking one from the row. */
let shrinkWraps = false;
let faults: AdaptiveBarFault[] = [];

/** The occupants the row itself is holding — not the ones parked in its dock. */
function heldByRow(root: Element): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>("[data-adaptive-bar-item]"),
  ].filter((c) => c.parentElement === root);
}

function measureLateOnset(el: Element): number {
  if (el.hasAttribute("data-adaptive-bar-trigger")) return 30;
  if (el.hasAttribute("data-adaptive-bar-item")) {
    return (el as HTMLElement).hidden ? 0 : ITEM_PX;
  }
  const held = heldByRow(el);
  const shown = held.filter((c) => !c.hidden);
  if (held.length > 0 && shown.length === 0) probes += 1;
  else passes += 1;
  return shrinkWraps ? Math.min(CAP_PX, shown.length * ITEM_PX) : givenPx;
}

function LateOnsetRow(): ReactElement {
  return (
    // A fresh arrow every render, so a re-render re-runs the pass — the stand-in
    // for the ResizeObserver, which cannot fire in jsdom.
    <AdaptiveBarMeasure measure={(el) => measureLateOnset(el)}>
      <AdaptiveBar gap="xs" label="Actions" overflow="clip">
        {["alpha", "beta", "gamma"].map((id) => (
          <AdaptiveBar.Item key={id} id={id}>
            <Probe id={id} />
          </AdaptiveBar.Item>
        ))}
      </AdaptiveBar>
    </AdaptiveBarMeasure>
  );
}

describe("a premise verified per width rather than once per mount", () => {
  beforeEach(() => {
    passes = 0;
    probes = 0;
    givenPx = 0;
    shrinkWraps = false;
    faults = [];
    // The production path is the one under test: in dev `failLoudly` throws,
    // which unmounts the tree and hides what the bar does next.
    vi.stubEnv("DEV", false);
    adaptiveBarReportSink.register((fault) => faults.push(fault));
  });

  it("catches a host that stops giving the row room after mount", () => {
    givenPx = CAP_PX;
    const { rerender } = render(<LateOnsetRow />);

    // Healthy: 250px of row, 100px each, so the third is clipped out of it —
    // the primitive working, and nothing to report.
    expect(faults).toEqual([]);
    expect(inlineCount()).toBe(2);
    rerender(<LateOnsetRow />);
    rerender(<LateOnsetRow />);
    expect(faults).toEqual([]);

    // The host now takes its width from what the row is holding. The one-shot
    // flag this replaced had already been spent at mount, so from here the
    // ratchet ran unobserved: two occupants make a 200px row, which admits two,
    // and the next eviction would make it 100.
    shrinkWraps = true;
    rerender(<LateOnsetRow />);

    expect(faults.map((f) => f.kind)).toEqual(["no-slack"]);
    expect(inlineCount()).toBe(3);
  });

  it("never accuses a healthy host that is merely being narrowed", () => {
    givenPx = 400;
    const { rerender } = render(<LateOnsetRow />);
    expect(inlineCount()).toBe(3);

    // A pane being dragged narrower. Every step re-asks the question while
    // there is budget, and every answer is the same one: the width did not move
    // when the content did.
    for (const width of [340, 280, 220, 160]) {
      givenPx = width;
      rerender(<LateOnsetRow />);
    }

    expect(faults).toEqual([]);
    // And the bar kept doing its job through all of it — a guard that fires on
    // nothing is only half the claim.
    expect(inlineCount()).toBe(1);
  });

  it("spends at most its probe budget, however long the drag", () => {
    givenPx = 500;
    const { rerender } = render(<LateOnsetRow />);

    for (let i = 0; i < 10; i += 1) {
      givenPx -= 30;
      rerender(<LateOnsetRow />);
    }

    // Ten narrowings, each of them a width the premise has not been verified
    // at: without the budget that is ten forced reflows, and a real drag
    // produces one per frame.
    expect(passes).toBeGreaterThan(MAX_SLACK_PROBES);
    expect(probes).toBeGreaterThan(1);
    expect(probes).toBeLessThanOrEqual(MAX_SLACK_PROBES);
    expect(faults).toEqual([]);
  });
});

/**
 * A row that generates NO BOX has no width to have been given.
 *
 * This app keeps whole surfaces mounted but not rendered — an unfocused tab, a
 * minimized floating window, a collapsed miller column are all `display: none`
 * subtrees — and everything inside one measures 0px. A bar that had already
 * evicted something while it was visible therefore read `available <= 0` with
 * occupants parked outside the row, which is branch A's exact shape, and filed
 * a fault against a host that had done nothing wrong. It was live in production
 * for the conversation prompt bar.
 *
 * The 0 is not a width, it is the ABSENCE of one, and the act it triggered
 * (`degraded`) latches for the life of the mount: the surface loses the
 * relocation behaviour this primitive exists to provide until it remounts. So
 * the distinction the bar now draws is between "no box" and "a box measuring
 * nothing", asked through the measurement seam — jsdom returns `[]` from
 * `getClientRects()` for every element, so a direct call would make this branch
 * permanently dead here.
 */

/** What the host hands the row while it is on screen. */
let hostPx = 0;
/** Does the bar's root generate a box — i.e. is the surface holding it shown? */
let hostRendered = true;
/** Reads taken against an item container: the measurement loop's signature. */
let itemMeasures = 0;
let hiddenFaults: AdaptiveBarFault[] = [];

function measureHiddenHost(el: Element): number {
  if (el.hasAttribute("data-adaptive-bar-trigger"))
    return hostRendered ? 30 : 0;
  if (el.hasAttribute("data-adaptive-bar-item")) {
    itemMeasures += 1;
    if (!hostRendered) return 0;
    return (el as HTMLElement).hidden ? 0 : ITEM_PX;
  }
  // A `display: none` ancestor zeroes every rect underneath it, root included.
  return hostRendered ? hostPx : 0;
}

function HiddenHostRow(): ReactElement {
  return (
    // Fresh arrows every render, so a re-render moves the bundle's deps and the
    // pass re-runs — the stand-in for the ResizeObserver, which in production is
    // exactly what delivers the 0×0 observation on the transition to
    // `display: none` and cannot fire in jsdom.
    <AdaptiveBarMeasure
      measure={(el) => measureHiddenHost(el)}
      isRendered={() => hostRendered}
    >
      <AdaptiveBar gap="xs" label="Actions" overflow="clip">
        {["alpha", "beta", "gamma"].map((id) => (
          <AdaptiveBar.Item key={id} id={id}>
            <Probe id={id} />
          </AdaptiveBar.Item>
        ))}
      </AdaptiveBar>
    </AdaptiveBarMeasure>
  );
}

describe("a row that generates no box", () => {
  beforeEach(() => {
    hostPx = CAP_PX;
    hostRendered = true;
    itemMeasures = 0;
    hiddenFaults = [];
    // The production path is the one under test: in dev `failLoudly` throws,
    // which unmounts the tree and hides what the bar does next.
    vi.stubEnv("DEV", false);
    adaptiveBarReportSink.register((fault) => hiddenFaults.push(fault));
  });

  it("stays silent while its host is hidden, and still overflows when shown again", () => {
    const { rerender } = render(<HiddenHostRow />);

    // Healthy and overflowing: 250px of row, 100px each, so the third is
    // clipped out of it. This is what makes the hide interesting — with
    // nothing evicted the branch is never reached.
    expect(hiddenFaults).toEqual([]);
    expect(inlineCount()).toBe(2);

    // The tab loses focus: `display: none`, every rect zero, no box anywhere.
    hostRendered = false;
    rerender(<HiddenHostRow />);
    expect(hiddenFaults).toEqual([]);

    // Shown again at the width it had. The load-bearing assertion is this one
    // rather than the silence above: `degraded` latches for the life of the
    // mount, so a fix that merely suppressed the report while still calling
    // `setDegraded` would pass the fault count and fail here — the bar would be
    // holding all three inline for ever.
    hostRendered = true;
    rerender(<HiddenHostRow />);
    expect(hiddenFaults).toEqual([]);
    expect(inlineCount()).toBe(2);
  });

  it("re-admits everything when a RENDERED row measures nothing, and decides again when the width comes back", () => {
    const { rerender } = render(<HiddenHostRow />);
    expect(inlineCount()).toBe(2);

    // A box that really is zero wide — and a width its host really gave the bar,
    // so `isRendered` says yes and the recovery branch is the one that runs. The
    // host here is not content-following (it answers `hostPx` however much the
    // row is holding), which is the over-full row: `flex: 1 1 0%` against
    // negative free space resolves to nothing while fully laid out.
    hostPx = 0;
    rerender(<HiddenHostRow />);

    // Everything re-admitted, and the re-admission is what ANSWERS the
    // question: a row holding all of its occupants and still measuring nothing
    // was never collapsed by the bar's own evictions. So it is said out loud —
    // at 0px with `overflow-hidden` the whole toolbar is clipped away, and
    // silence there is an invisible surface nobody can act on — but it is said
    // without latching anything.
    expect(hiddenFaults.map((f) => f.kind)).toEqual(["no-slack"]);
    expect(hiddenFaults[0]?.message).toMatch(/the row it sits in is over-full/);
    expect(hiddenFaults[0]?.message).toMatch(/nothing has been latched/);
    expect(inlineCount()).toBe(3);

    // The load-bearing half. A bar that latched holds all three for ever; this
    // one goes straight back to work at the width it had before.
    hostPx = CAP_PX;
    rerender(<HiddenHostRow />);
    expect(inlineCount()).toBe(2);

    // And it says it once. The state is recoverable and self-healing, so a
    // report per collapse would be noise about a row that is already fine.
    hostPx = 0;
    rerender(<HiddenHostRow />);
    hostPx = CAP_PX;
    rerender(<HiddenHostRow />);
    expect(hiddenFaults).toHaveLength(1);
    expect(inlineCount()).toBe(2);
  });

  it("keeps deciding across many collapses, which a per-mount budget could not", () => {
    const { rerender } = render(<HiddenHostRow />);

    // A pane being dragged back and forth across the width where its row starts
    // over-filling. Every crossing spends a recovery, so a counter scoped to the
    // MOUNT rather than to the last settled answer would run out here and hand
    // the user the permanent latch this whole branch exists to avoid.
    for (let i = 0; i < MAX_ZERO_RECOVERIES + 3; i += 1) {
      hostPx = 0;
      rerender(<HiddenHostRow />);
      hostPx = CAP_PX;
      rerender(<HiddenHostRow />);
    }

    // Still deciding, and still only the one over-full note to show for it.
    expect(hiddenFaults).toHaveLength(1);
    expect(inlineCount()).toBe(2);
  });

  it("waits for a gesture to end before re-admitting anything", () => {
    const { rerender } = render(<HiddenHostRow />);
    expect(inlineCount()).toBe(2);

    // The occupant the row could not fit. Re-admitting is a re-parent, so doing
    // it under a live pointer would release the capture and kill the gesture —
    // and this is exactly the state where that happens, because a pinned
    // occupant that is already out of the row STAYS out, which is what keeps
    // the zero-width branch reachable for as long as the gesture lasts.
    const parked = [
      ...document.querySelectorAll<HTMLElement>("[data-adaptive-bar-item]"),
    ].find((c) => c.parentElement?.hidden === true);
    const parkedId = parked?.getAttribute("data-adaptive-bar-item");
    expect(parkedId).toBeTypeOf("string");
    fireEvent.pointerDown(
      document.querySelector<HTMLElement>(`[data-probe="${parkedId ?? ""}"]`)!,
      { pointerId: 1 },
    );

    hostPx = 0;
    rerender(<HiddenHostRow />);

    // Deferred, not decided and not accused: the widget under the pointer is
    // still where the gesture left it.
    expect(hiddenFaults).toEqual([]);
    expect(inlineCount()).toBe(2);

    // Deferred, never dropped — the release is what lets the recovery run.
    fireEvent.pointerUp(document, { pointerId: 1 });
    rerender(<HiddenHostRow />);
    expect(inlineCount()).toBe(3);
    expect(hiddenFaults.map((f) => f.kind)).toEqual(["no-slack"]);
  });

  it("measures nothing at all while the host is hidden", () => {
    render(<HiddenHostRow />);

    hostRendered = false;
    itemMeasures = 0;
    render(<HiddenHostRow />);

    // The early return sits ABOVE the measurement loop, so a hidden pass costs
    // one root read and stops. Reading the occupants would be reading zeros
    // into the width cache, where they are sticky.
    expect(itemMeasures).toBe(0);
  });
});

/**
 * The two things a RENDERED 0px row can mean, and the guard that can tell them
 * apart.
 *
 * A row that generates a box and still measures nothing with occupants parked
 * outside it is either the ratchet at its end — the host shrink-wraps to the
 * bar, every eviction shrank the width that decided the next one, and the row
 * has emptied itself — or a row that is merely OVER-FULL, where `flex: 1 1 0%`
 * against negative free space resolves to exactly 0px while fully laid out.
 * The width alone cannot separate them, and the remedy for one is catastrophic
 * for the other: `degraded` latches for the life of the mount.
 *
 * The differential probe CAN separate them, and is correctly silent for the
 * over-full row (hiding the occupants does not change a width that comes from
 * free space) — but it needs occupants in the row to hide, which is exactly
 * what the ratchet has run out of. So the bar re-admits everything and re-asks
 * instead of guessing, and the pass after the recovery is where the two part
 * company. The cases below are that fork, both ways, plus its bound.
 */

/** What a host that GIVES a width hands the row, before anything goes wrong. */
let ratchetPx = 0;
/** Once true, the row's width IS the content it is holding — the ratchet. */
let contentDriven = false;
let ratchetFaults: AdaptiveBarFault[] = [];

function measureRatchet(el: Element): number {
  if (el.hasAttribute("data-adaptive-bar-trigger")) return 30;
  if (el.hasAttribute("data-adaptive-bar-item")) {
    return (el as HTMLElement).hidden ? 0 : ITEM_PX;
  }
  const shown = heldByRow(el).filter((c) => !c.hidden);
  return contentDriven ? shown.length * ITEM_PX : ratchetPx;
}

function RatchetRow(): ReactElement {
  return (
    <AdaptiveBarMeasure measure={(el) => measureRatchet(el)}>
      <AdaptiveBar gap="xs" label="Actions" overflow="clip">
        {["alpha", "beta", "gamma"].map((id) => (
          <AdaptiveBar.Item key={id} id={id}>
            <Probe id={id} />
          </AdaptiveBar.Item>
        ))}
      </AdaptiveBar>
    </AdaptiveBarMeasure>
  );
}

describe("a rendered row that measures nothing", () => {
  beforeEach(() => {
    ratchetPx = 400;
    contentDriven = false;
    ratchetFaults = [];
    // The production path is the one under test: in dev `failLoudly` throws,
    // which unmounts the tree and hides what the bar does next.
    vi.stubEnv("DEV", false);
    adaptiveBarReportSink.register((fault) => ratchetFaults.push(fault));
  });

  it("hands the ratchet's end state to the probe, which names it properly", () => {
    const { rerender } = render(<RatchetRow />);
    expect(inlineCount()).toBe(3);

    // Narrow past the point where anything fits: in `clip` mode every occupant
    // is evictable, so the row ends up holding nothing. Still a healthy host —
    // its width does not move when the row empties — so nothing is reported.
    ratchetPx = 10;
    rerender(<RatchetRow />);
    expect(ratchetFaults).toEqual([]);
    expect(inlineCount()).toBe(0);

    // NOW the host starts taking its width from the row's content. With the row
    // already empty that reads as 0, which is branch A's exact shape — and the
    // probe cannot be asked, because a probe with nothing to hide proves
    // nothing. The recovery is what puts the occupants back where it can.
    contentDriven = true;
    rerender(<RatchetRow />);

    expect(ratchetFaults.map((f) => f.kind)).toEqual(["no-slack"]);
    // And it is the probe's diagnosis, in the probe's words — not the 0px
    // branch guessing. That is the whole point of the hand-off.
    expect(ratchetFaults[0]?.message).toMatch(/moves with its own content/);
    // The ceiling: everything back in the row, CSS clips.
    expect(inlineCount()).toBe(3);
  });
});

/**
 * A host that contradicts itself: 0 whenever anything has been evicted, a fixed
 * width otherwise. Hiding the occupants — which is what the probe does — leaves
 * them in the row, so the probe reads the same number twice and answers "the
 * premise holds" every single time.
 *
 * No guard can get a true answer out of that, which is precisely why the
 * recovery is bounded. Note the loop is entirely SYNCHRONOUS: `reconcile`
 * re-enters itself through its layout effect after every commit, so this is the
 * shape that ends in "maximum update depth exceeded" if nothing counts it.
 */
const GIVEN_PX = 250;
let contradictingFaults: AdaptiveBarFault[] = [];

function measureContradicting(el: Element): number {
  if (el.hasAttribute("data-adaptive-bar-trigger")) return 30;
  if (el.hasAttribute("data-adaptive-bar-item")) {
    return (el as HTMLElement).hidden ? 0 : ITEM_PX;
  }
  return heldByRow(el).length === 3 ? GIVEN_PX : 0;
}

function ContradictingRow(): ReactElement {
  return (
    <AdaptiveBarMeasure measure={(el) => measureContradicting(el)}>
      <AdaptiveBar gap="xs" label="Actions" overflow="clip">
        {["alpha", "beta", "gamma"].map((id) => (
          <AdaptiveBar.Item key={id} id={id}>
            <Probe id={id} />
          </AdaptiveBar.Item>
        ))}
      </AdaptiveBar>
    </AdaptiveBarMeasure>
  );
}

describe("a host no guard can get a true answer out of", () => {
  beforeEach(() => {
    contradictingFaults = [];
    vi.stubEnv("DEV", false);
    adaptiveBarReportSink.register((fault) => contradictingFaults.push(fault));
  });

  it("re-asks a bounded number of times, then takes the ceiling for good", () => {
    render(<ContradictingRow />);

    // One fault, not one per recovery: the recoveries are silent (a row with no
    // room is cramped, not wrong), and only the exhausted budget is reported.
    expect(contradictingFaults.map((f) => f.kind)).toEqual(["no-slack"]);
    expect(contradictingFaults[0]?.message).toMatch(
      new RegExp(`Re-admitting every occupant ${String(MAX_ZERO_RECOVERIES)}`),
    );
    expect(inlineCount()).toBe(3);
  });
});
