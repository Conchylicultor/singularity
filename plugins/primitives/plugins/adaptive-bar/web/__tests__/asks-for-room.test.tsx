import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { type ReactElement, type ReactNode } from "react";
import { useActionForm } from "@plugins/primitives/plugins/action-presentation/web";
import { GrowRelay } from "@plugins/primitives/plugins/css/plugins/grow-relay/web";
import {
  AdaptiveBar,
  AdaptiveBarMeasure,
  adaptiveBarReportSink,
} from "../index";
import type { AdaptiveBarFault } from "../index";

/**
 * The bar asks its host for room, and the host answers before the bar decides.
 *
 * This is the pair `no-slack.test.tsx` leaves open. That suite pins what happens
 * to a bar whose host never gives it room; this one pins the mechanism that
 * stops the same host from being *born* that way — the `grow-relay` ask, which
 * replaced a `fill: true` two files from the bar that both of the repo's
 * slot-hosted bars forgot once each.
 *
 * The ordering is the whole point and the reason this cannot be a unit test on
 * the relay. The relay applies the grow in a state update from a layout effect,
 * and React flushes those AFTER every layout effect of the commit — including
 * the bar's own measuring one. Deciding on that first reading would judge the
 * un-grown box, and `no-slack` latches. So the bar waits on `granted`, and the
 * assertion below is that it waited: same tree, same measurer, one relay
 * between — no fault, nothing evicted.
 */

const ITEM_PX = 100;
/** What the host gives once it has been asked. Room for all three. */
const CAP_PX = 400;

/**
 * The `slot-render` cell, modelled through the primitive's own measurement seam
 * (jsdom has no layout engine): rigid by default, so its width IS the row's
 * content and every eviction shrinks the number deciding the next one — and
 * `CAP_PX` once a relay above the row reports that it grew.
 */
function cellMeasure(el: Element): number {
  if (el.hasAttribute("data-adaptive-bar-trigger")) return 30;
  if (el.hasAttribute("data-adaptive-bar-item")) {
    return (el as HTMLElement).hidden ? 0 : ITEM_PX;
  }
  if (el.closest("[data-cell='grown']") !== null) return CAP_PX;
  const inline = [
    ...el.querySelectorAll<HTMLElement>("[data-adaptive-bar-item]"),
  ].filter((c) => c.parentElement === el && !c.hidden);
  return inline.length * ITEM_PX;
}

/** A relaying cell: the one box between the bar and the room. */
function Cell({ children }: { children: ReactNode }): ReactElement {
  return (
    <GrowRelay>
      {(growing) => (
        <div data-cell={growing ? "grown" : "rigid"}>{children}</div>
      )}
    </GrowRelay>
  );
}

function Probe({ id }: { id: string }): ReactElement {
  useActionForm();
  return <span data-probe={id}>{id}</span>;
}

function Bar(): ReactElement {
  return (
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
  );
}

function inlineCount(): number {
  return [
    ...document.querySelectorAll<HTMLElement>("[data-adaptive-bar-item]"),
  ].filter((c) => c.parentElement?.hidden !== true).length;
}

function collectFaults(): AdaptiveBarFault[] {
  const faults: AdaptiveBarFault[] = [];
  adaptiveBarReportSink.register((f) => {
    faults.push(f);
  });
  return faults;
}

afterEach(() => {
  cleanup();
  adaptiveBarReportSink.register(null);
  vi.unstubAllEnvs();
});

describe("a bar asks its host for room", () => {
  it("keeps every occupant, because the cell grew before the first measurement", () => {
    vi.stubEnv("DEV", false);
    const faults = collectFaults();

    render(
      <AdaptiveBarMeasure measure={cellMeasure}>
        <Cell>
          <Bar />
        </Cell>
      </AdaptiveBarMeasure>,
    );

    expect(
      document.querySelector("[data-cell]")?.getAttribute("data-cell"),
    ).toBe("grown");
    expect(faults).toEqual([]);
    expect(inlineCount()).toBe(3);
  });

  it("still faults with the identical host and no relay in between", () => {
    // The control. Without it the assertion above could pass for a measurer
    // that simply never shrink-wraps.
    vi.stubEnv("DEV", false);
    const faults = collectFaults();

    render(
      <AdaptiveBarMeasure measure={cellMeasure}>
        <div>
          <Bar />
        </div>
      </AdaptiveBarMeasure>,
    );

    expect(faults.map((f) => f.kind)).toContain("no-slack");
  });
});
