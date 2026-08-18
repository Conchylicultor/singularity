import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { type ReactElement } from "react";
import { useActionForm } from "@plugins/primitives/plugins/action-presentation/web";
import {
  AdaptiveBar,
  AdaptiveBarMeasure,
  adaptiveBarReportSink,
} from "../index";
import type { AdaptiveBarFault } from "../index";
import { MAX_SLACK_PROBES } from "../internal/diagnostics";

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
