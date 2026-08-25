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

/**
 * "One adaptive bar per row", as a test rather than as a sentence.
 *
 * Two MEASURING bars in one row cannot both be right. Each declares itself
 * `min-w-0 flex-1` and asks the chain above it to grow, precisely so that its
 * own rect IS the room it was given — so the inner one takes the row's whole
 * slack and the outer one is left measuring its own content. What the user sees
 * is the outer bar's failure (a pane title crushed to its first word, a `⋯` that
 * collapses nothing) and what gets filed is the outer bar's `no-slack`, naming
 * a host that is fine. The offender is the nesting, and it is knowable from the
 * tree alone: a bar can see the registry of the bar above it.
 *
 * The exclusion is the load-bearing half. `AdaptiveBar.Collapsed` nested inside
 * a bar is legitimate and ships today — `reorder`'s `overflow` node type renders
 * one inside pane headers — because it is a single `shrink-0` `⋯` that measures
 * nothing and takes no slack. A false positive there would break a valid
 * composition, so both directions are pinned here.
 */

const ITEM_PX = 60;
const ROW_PX = 400;
/** What the nested bar's own row is given: too little for its three occupants. */
const NESTED_ROW_PX = 100;

/**
 * A host that GIVES every bar root a width, so no bar here can fault for any
 * reason but the nesting — except the nested row, which is deliberately too
 * narrow for what it holds. That is what makes the ceiling observable: a bar
 * still deciding at 100px would evict two of its three occupants.
 */
function generousMeasure(el: Element): number {
  if (el.hasAttribute("data-adaptive-bar-trigger")) return 20;
  if (el.hasAttribute("data-adaptive-bar-item")) {
    return (el as HTMLElement).hidden ? 0 : ITEM_PX;
  }
  // A bar root that sits inside an item container is a bar inside a bar.
  return el.closest("[data-adaptive-bar-item]") === null
    ? ROW_PX
    : NESTED_ROW_PX;
}

function Probe({ id }: { id: string }): ReactElement {
  useActionForm();
  return <span data-probe={id}>{id}</span>;
}

let faults: AdaptiveBarFault[] = [];

beforeEach(() => {
  faults = [];
  // The production path is the one under test: in dev `failLoudly` throws,
  // which unmounts the tree and hides what the bar does next.
  vi.stubEnv("DEV", false);
  adaptiveBarReportSink.register((fault) => faults.push(fault));
});

afterEach(() => {
  cleanup();
  adaptiveBarReportSink.register(null);
  vi.unstubAllEnvs();
});

/** A widget that hand-rolls its own overflow inside a row that already has one. */
function NestedRow(): ReactElement {
  return (
    <AdaptiveBarMeasure measure={generousMeasure}>
      <AdaptiveBar gap="xs" label="Header">
        <AdaptiveBar.Item id="back">
          <Probe id="back" />
        </AdaptiveBar.Item>
        <AdaptiveBar.Item id="picker">
          <AdaptiveBar gap="xs" label="More displays">
            {["notation", "roll", "sheet"].map((id) => (
              <AdaptiveBar.Item key={id} id={id}>
                <Probe id={id} />
              </AdaptiveBar.Item>
            ))}
          </AdaptiveBar>
        </AdaptiveBar.Item>
      </AdaptiveBar>
    </AdaptiveBarMeasure>
  );
}

describe("a measuring bar inside another bar's occupant", () => {
  it("names the nesting, at the bar that did it", () => {
    render(<NestedRow />);

    // One fault, about the INNER bar — the outer one is measuring a width its
    // host really gave it, so it has nothing to say. Which bar it is about is
    // the whole value of the kind: the outer bar's `no-slack` (the report this
    // replaces in practice) accuses a host that is not the problem.
    expect(faults.map((f) => f.kind)).toEqual(["nested-bar"]);
    expect(faults[0]?.label).toBe("More displays");
    expect(faults[0]?.message).toMatch(/INSIDE another adaptive bar/);
  });

  it("stops the inner bar deciding, keeping every occupant in the row", () => {
    render(<NestedRow />);

    // The ceiling, not the floor: a bar whose width reading cannot be trusted
    // must not evict, because eviction is what the bad reading was already
    // producing. Its row is only 100px wide here, so a bar still deciding would
    // have moved two of these three into its panel — which is outside the
    // occupant container the nested bar lives in.
    const picker = document.querySelector('[data-adaptive-bar-item="picker"]');
    expect(picker).not.toBeNull();
    for (const id of ["notation", "roll", "sheet"]) {
      const held = document.querySelector(`[data-adaptive-bar-item="${id}"]`);
      expect(picker?.contains(held ?? null)).toBe(true);
    }
  });

  it("says it once, however often the host re-renders", () => {
    const { rerender } = render(<NestedRow />);
    rerender(<NestedRow />);
    rerender(<NestedRow />);

    expect(faults).toHaveLength(1);
  });

  it("throws in dev, where a bar that cannot be given room must not be lived with", () => {
    vi.stubEnv("DEV", true);
    expect(() => render(<NestedRow />)).toThrow(
      /adaptive-bar \(More displays\)/,
    );
  });
});

/**
 * The authored bucket, nested exactly the way `reorder`'s `overflow` node type
 * nests it inside a pane header.
 */
function CollapsedInsideRow(): ReactElement {
  return (
    <AdaptiveBarMeasure measure={generousMeasure}>
      <AdaptiveBar gap="xs" label="Header">
        <AdaptiveBar.Item id="back">
          <Probe id="back" />
        </AdaptiveBar.Item>
        <AdaptiveBar.Item id="bucket">
          <AdaptiveBar.Collapsed label="More tools">
            {["cut", "copy"].map((id) => (
              <AdaptiveBar.Item key={id} id={id}>
                <Probe id={id} />
              </AdaptiveBar.Item>
            ))}
          </AdaptiveBar.Collapsed>
        </AdaptiveBar.Item>
      </AdaptiveBar>
    </AdaptiveBarMeasure>
  );
}

describe("an AdaptiveBar.Collapsed inside a bar", () => {
  it("is legitimate and reports nothing", () => {
    render(<CollapsedInsideRow />);

    // It is one `shrink-0` ⋯ among the row's occupants: it measures nothing and
    // asks for none of the row's slack, so it is not a second claimant on
    // anything. This composition ships today inside pane headers, and a false
    // positive here would break it.
    expect(faults).toEqual([]);
  });

  it("still relocates its own members into its panel", () => {
    render(<CollapsedInsideRow />);

    // The silence above is only half the claim — the nested bucket has to keep
    // WORKING. Every member relocates unconditionally, so none of them is still
    // inside the occupant container the bucket itself sits in, and each is still
    // the same live instance rather than a re-rendered menu row.
    const bucket = document.querySelector('[data-adaptive-bar-item="bucket"]');
    expect(bucket).not.toBeNull();
    for (const id of ["cut", "copy"]) {
      const member = document.querySelector(`[data-adaptive-bar-item="${id}"]`);
      expect(bucket?.contains(member ?? null)).toBe(false);
      expect(document.querySelector(`[data-probe="${id}"]`)).not.toBeNull();
    }
  });
});
