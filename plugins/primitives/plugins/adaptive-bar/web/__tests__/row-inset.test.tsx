import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import {
  AdaptiveBar,
  AdaptiveBarMeasure,
  adaptiveBarReportSink,
  type AdaptiveBarFault,
} from "../index";

/**
 * The fit's budget is the row's CONTENT box, never its border box:
 * `available = measure(root) - readRowMetrics(root).insetPx` in `reconcile`
 * (`web/internal/adaptive-bar.tsx`). jsdom has no layout engine, so the row's
 * raw WIDTH still has to come through the measurement seam like every other
 * jsdom suite here — but `readRowMetrics` reads `getComputedStyle`, and jsdom
 * resolves that faithfully for an INLINE style, padding included. So this is
 * the one jsdom test that can drive `insetPx` through the real code path
 * instead of a fake number standing in for it.
 *
 * Same root width, same three occupants, at two reads that differ in nothing
 * but the padding on the bar's own root. Without honoring `insetPx` the fit
 * would bless all three at both reads — `measure(root)` never moves, so a
 * budget that forgot to subtract the padding would not either.
 */

const ROOT_PX = 350;
const ITEM_PX = 100;
const TRIGGER_PX = 30;
/** 3×100 = 300. Fits the unpadded 350px root; does not fit 350 - 80 = 270. */
const IDS = ["alpha", "beta", "gamma"] as const;

function measureFake(el: Element): number {
  if (el.hasAttribute("data-adaptive-bar-trigger")) return TRIGGER_PX;
  if (el.hasAttribute("data-adaptive-bar-item")) return ITEM_PX;
  return ROOT_PX;
}

/** No ladder declared — a fixed-width occupant that can only be inline or
 * evicted, exactly like `LabelledChip` in the fixtures. What matters here is
 * COUNT, not which rung an item lands on. */
function Item({ id }: { id: string }): ReactElement {
  return <span>{id}</span>;
}

function Bar({ label }: { label: string }): ReactElement {
  return (
    <AdaptiveBarMeasure measure={measureFake}>
      <AdaptiveBar gap="none" label={label}>
        {IDS.map((id) => (
          <AdaptiveBar.Item key={id} id={id}>
            <Item id={id} />
          </AdaptiveBar.Item>
        ))}
      </AdaptiveBar>
    </AdaptiveBarMeasure>
  );
}

const faults: AdaptiveBarFault[] = [];

beforeEach(() => {
  faults.length = 0;
  // The production path is the one under test — see `termination.test.tsx`
  // for why: in dev `failLoudly` throws instead of reporting, which would hide
  // the very thing a stray fault here is meant to surface.
  vi.stubEnv("DEV", false);
  adaptiveBarReportSink.register((fault) => faults.push(fault));
});

afterEach(() => {
  adaptiveBarReportSink.register(null);
  vi.unstubAllEnvs();
  cleanup();
});

/** Ids whose container currently sits directly in the row, in bar order. */
function inlineIds(root: Element): string[] {
  return IDS.filter((id) => {
    const container = document.querySelector(
      `[data-adaptive-bar-item="${id}"]`,
    );
    return container?.parentNode === root;
  });
}

describe("the fit's budget is the row's content box", () => {
  it("keeps every occupant inline until real padding eats the room, then sheds one", () => {
    const { rerender } = render(<Bar label="More actions" />);

    // The bar root: the trigger's own parent, which is the one element
    // `AdaptiveBar` renders as its row (`Stack ref={setRoot}`).
    const trigger = document.querySelector("[data-adaptive-bar-trigger]");
    if (trigger === null) throw new Error("trigger not found");
    const root = trigger.parentElement;
    if (root === null) throw new Error("bar root not found");

    // No padding yet: border box IS content box. 300px of occupants fits the
    // 350px root with room to spare.
    expect(inlineIds(root)).toEqual([...IDS]);

    // Real padding, on the real DOM node, read by the real `getComputedStyle`
    // — not the measurement seam, which only stands in for the row's raw
    // WIDTH. 80px of it eats the row down to 270px of content box, below what
    // three 100px occupants need, so a fit that subtracts it correctly has to
    // shed one (270 - TRIGGER_PX still covers the remaining two).
    root.style.paddingLeft = "40px";
    root.style.paddingRight = "40px";
    // `label` is one of `reconcile`'s own dependencies (see the callback's
    // deps in `adaptive-bar.tsx`), so handing it a new one forces a fresh
    // measure-and-decide pass with nothing else about the row disturbed.
    rerender(<Bar label="More" />);

    expect(inlineIds(root)).toHaveLength(2);
    // A correct eviction is the fit doing its job, not a fault — the
    // engine-facing guards (`no-slack`, `row-overflow`) are gated on a real
    // layout engine and cannot fire in jsdom regardless, but this confirms
    // nothing ELSE (a premise-shift ceiling, a stray `iframe` check) tripped.
    expect(faults).toEqual([]);
  });
});
