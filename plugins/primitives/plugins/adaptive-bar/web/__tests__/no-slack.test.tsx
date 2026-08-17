import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { type ReactElement } from "react";
import { useActionForm } from "@plugins/primitives/plugins/action-presentation/web";
import {
  AdaptiveBar,
  AdaptiveBarMeasure,
  adaptiveBarReportSink,
} from "../index";
import type { AdaptiveBarFault } from "../index";

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
