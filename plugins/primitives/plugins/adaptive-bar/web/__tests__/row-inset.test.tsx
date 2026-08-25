import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
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

/**
 * The yielding child is the row's GIVE, and the budget is where that has to be
 * true twice over: it is never measured, never demoted, never relocated — and it
 * gives only down to a floor.
 *
 * Without the floor it gives until it is nothing, and it gives FIRST: the
 * occupants are rigid, so flex takes the whole deficit out of the one child that
 * can shrink, the row never overflows, and the fit is never asked to move
 * anybody. A pane title went to "Une" and then to nothing while ten header
 * widgets stayed inline.
 *
 * `measureYieldRow` answers `rootPx` for anything that is neither the trigger
 * nor a registered container — so if the yielding child ever entered the ledger
 * it would be read as a whole-row-wide occupant and nothing at all would fit.
 * That is what keeps "all three still inline" a real assertion here rather than
 * a restatement of the previous test.
 */
describe("AdaptiveBar.Yield", () => {
  /**
   * The floor in pixels: 8em of the CELL's own font size, and jsdom answers
   * `"medium"` for a font size nobody set — which is not a length, so the cell
   * falls back to what `medium` resolves to in every engine, 16px.
   */
  const YIELD_FLOOR_PX = 8 * 16;
  /** 3 × 100 + the floor, with room to spare: nothing has to move. */
  const ROOMY_PX = 500;
  /**
   * The width that separates the two behaviours. 3 × 100 fits the ROW (400),
   * and does not fit the row minus the floor (272) — so a bar with a title
   * relocates one occupant here and a bar without a title does not.
   */
  const TIGHT_PX = 400;

  let rootPx = ROOMY_PX;

  function measureYieldRow(el: Element): number {
    if (el.hasAttribute("data-adaptive-bar-trigger")) return TRIGGER_PX;
    if (el.hasAttribute("data-adaptive-bar-item")) return ITEM_PX;
    return rootPx;
  }

  /** The three occupants, with `title` in the yielding cell in front of them. */
  function YieldBar({
    title,
    label = "More",
    fontSize,
  }: {
    title: string | null;
    label?: string;
    /** Inherited by the yielding cell, which is where the floor's `em` is read. */
    fontSize?: string;
  }): ReactElement {
    return (
      <div style={fontSize === undefined ? undefined : { fontSize }}>
        <AdaptiveBarMeasure measure={measureYieldRow}>
          <AdaptiveBar gap="none" label={label}>
            <AdaptiveBar.Yield>
              {title === null ? null : <span data-testid="yield">{title}</span>}
            </AdaptiveBar.Yield>
            {IDS.map((id) => (
              <AdaptiveBar.Item key={id} id={id}>
                <Item id={id} />
              </AdaptiveBar.Item>
            ))}
          </AdaptiveBar>
        </AdaptiveBarMeasure>
      </div>
    );
  }

  const TITLE = "A pane title long enough to truncate";

  function barRoot(): HTMLElement {
    const trigger = document.querySelector("[data-adaptive-bar-trigger]");
    const root = trigger?.parentElement ?? null;
    if (root === null) throw new Error("bar root not found");
    return root;
  }

  beforeEach(() => {
    rootPx = ROOMY_PX;
  });

  it("does not enter the fit budget", () => {
    render(<YieldBar title={TITLE} />);
    const root = barRoot();

    // 3 × 100 against a 500px row whose floor takes 128 of it — 372 left, so
    // every occupant stays inline and the yielding child cost the ledger
    // nothing of its own.
    expect(inlineIds(root)).toEqual([...IDS]);
    expect(faults).toEqual([]);
    // And it is not an occupant at all: no container was minted for it, so
    // there is nothing for the fit, the ledger or the dock plan to hold.
    expect(root.querySelectorAll("[data-adaptive-bar-item]")).toHaveLength(
      IDS.length,
    );
  });

  it("yields instead of being rigid", () => {
    render(<YieldBar title={TITLE} />);
    const label = document.querySelector<HTMLElement>("[data-testid='yield']");
    const cell = label === null ? null : label.parentElement;
    if (cell === null) throw new Error("yield cell not found");
    // `min-w-0` (yieldClass) so it can fall below its own content width and its
    // `<Text>` ellipsizes; NOT `shrink-0`, which is what every occupant carries
    // and what a rigid title uses to push the actions out of the row instead.
    expect(cell.className.split(" ")).toContain("min-w-0");
    expect(cell.className.split(" ")).not.toContain("shrink-0");
  });

  /**
   * The defect this floor exists for, at the one width that shows it: the row
   * holds all three occupants, and holds them only by taking every pixel of the
   * title. With the floor reserved the title keeps 128px and the row is over its
   * budget, so an occupant relocates — the ordinary remedy, applied to the
   * ordinary thing, instead of to the pane's own identity.
   */
  it("reserves its floor, so an occupant relocates instead of the title", () => {
    rootPx = TIGHT_PX;
    render(<YieldBar title={TITLE} />);
    const root = barRoot();

    // 272px of budget: two occupants plus the trigger (230) fit, three (300)
    // do not.
    expect(inlineIds(root)).toHaveLength(2);
    expect(faults).toEqual([]);
  });

  it("relocates nothing while there is room above the floor", () => {
    render(<YieldBar title={TITLE} />);
    expect(inlineIds(barRoot())).toEqual([...IDS]);
    expect(
      document
        .querySelector("[data-adaptive-bar-trigger]")
        ?.hasAttribute("hidden"),
    ).toBe(true);
  });

  /**
   * An empty cell has no legibility to protect, so it reserves nothing — the
   * same width that sheds an occupant for a title lands all three inline for a
   * pane that has none. A header whose title renders `null` must be laid out
   * exactly as it was before the floor existed.
   */
  it("reserves nothing while it renders nothing", () => {
    rootPx = TIGHT_PX;
    render(<YieldBar title={null} />);
    expect(inlineIds(barRoot())).toEqual([...IDS]);
    expect(faults).toEqual([]);
  });

  /**
   * And it starts reserving when the title arrives, which is a fact no width
   * carries: the row does not resize when a pane's title loads. The re-render
   * below hands `reconcile` all of its own dependencies unchanged — same label,
   * same measure function — so the only thing that can ask for a pass is the
   * cell's own child-list observer.
   */
  it("starts reserving when the title arrives late", async () => {
    rootPx = TIGHT_PX;
    const { rerender } = render(<YieldBar title={null} />);
    expect(inlineIds(barRoot())).toEqual([...IDS]);

    rerender(<YieldBar title={TITLE} />);
    // `MutationObserver` delivers on a microtask, so the pass it asks for lands
    // after this tick rather than inside the re-render.
    await act(async () => {
      await Promise.resolve();
    });

    expect(inlineIds(barRoot())).toHaveLength(2);
    expect(faults).toEqual([]);
  });

  /**
   * The floor is 8 of the cell's OWN ems, not a pixel constant: what makes a
   * title legible is a count of characters, and characters scale with the
   * active typography preset. At 6px the same floor is 48px, which the same
   * 400px row can pay out of its slack — so nothing relocates.
   */
  it("scales with the ambient font size", () => {
    rootPx = TIGHT_PX;
    render(<YieldBar title={TITLE} fontSize="6px" />);
    expect(inlineIds(barRoot())).toEqual([...IDS]);
    expect(faults).toEqual([]);
  });

  /**
   * The degenerate width: the row is narrower than the floor itself. The budget
   * is clamped at 0 rather than going negative — a negative budget is not a
   * narrower row, and `available <= 0` is the branch for "this is not a width",
   * which a merely-cramped row must never be sent down.
   *
   * At 0 the fit seats nobody: every evictable occupant relocates behind the
   * `⋯`, and the yielding cell keeps whatever the trigger leaves — below its
   * floor, because there is nothing left to take it from. Narrowing further
   * changes nothing, since the clamp holds the budget at 0.
   */
  it("clamps the budget at a row narrower than the floor", () => {
    rootPx = YIELD_FLOOR_PX - 28;
    const { rerender } = render(<YieldBar title={TITLE} />);
    const root = barRoot();
    expect(inlineIds(root)).toEqual([]);
    // The `⋯` is in the row and holding all three.
    expect(
      document
        .querySelector("[data-adaptive-bar-trigger]")
        ?.hasAttribute("hidden"),
    ).toBe(false);
    expect(faults).toEqual([]);

    // Narrower still: the same answer, reached without the bar oscillating or
    // spending its round budget on a width that cannot change the placement.
    rootPx = YIELD_FLOOR_PX / 2;
    rerender(<YieldBar title={TITLE} label="More actions" />);
    expect(inlineIds(root)).toEqual([]);
    expect(faults).toEqual([]);
  });

  it("refuses a second one, loudly", () => {
    function TwoYields(): ReactElement {
      return (
        <AdaptiveBarMeasure measure={measureYieldRow}>
          <AdaptiveBar gap="none" label="More">
            <AdaptiveBar.Yield>
              <span>title</span>
            </AdaptiveBar.Yield>
            <AdaptiveBar.Yield>
              <span>subtitle</span>
            </AdaptiveBar.Yield>
          </AdaptiveBar>
        </AdaptiveBarMeasure>
      );
    }
    // React re-logs the thrown error on its way out; the throw itself is the
    // assertion, so the log is noise.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => render(<TwoYields />)).toThrow(/at most one/);
    } finally {
      logged.mockRestore();
    }
  });
});
