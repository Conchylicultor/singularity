import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import {
  useActionForm,
  type YieldEagerness,
} from "@plugins/primitives/plugins/action-presentation/web";
import {
  AdaptiveBar,
  AdaptiveBarMeasure,
  adaptiveBarReportSink,
  type AdaptiveBarFault,
} from "../index";

/**
 * H2's evidence is a statement about ONE row at ONE width, and it has to stop
 * being read the moment that row moves.
 *
 * H2 bars a rung the bar promoted INTO, committed, and then measured as not
 * fitting — until the row is genuinely wider than the width that rejected it.
 * The evidence for it is the record of what the last committed pass promoted,
 * and that record used to survive every early return in `reconcile`: the
 * `root === null` return, the degraded return, the zero-width return, the
 * no-slack return, the surrender return. The consumption site then stamped the
 * resulting bar with the CURRENT round's width.
 *
 * So a pane that collapses after a promotion and reopens wider installed a bar
 * at a width that had never rejected anything, and the wider the row on reopen,
 * the longer the occupant stayed one rung narrower than it needed to be. Nothing
 * was reported, because a barred rung is not a fault — it is the mechanism
 * working.
 *
 * The fix wires the record to the premise the file already computes per round:
 * a shifted premise discards it, which covers every early return without
 * enumerating any of them. This drives exactly that shape.
 *
 * jsdom is the right place for it — the claim is about CONTROL FLOW ("was a bar
 * installed from evidence about a different row?"), not pixels. Widths come
 * through the primitive's own measurement seam, as in `premise.test.tsx`, and
 * the fit, the ledger and the bars all run as they do in a browser.
 *
 * The companion claim — that barring a narrow rung does not free the wider one
 * it implies — is pinned in `core/fit.test.ts` instead. It is a property of
 * `assign` reading the ledger, and reaching it through a jsdom drive would take
 * a fixture whose every step is a coincidence rather than a statement.
 */

/** Tight enough that three occupants at their widest do not fit. */
const TIGHT_ROW = 150;
/** Roomy enough to promote all three back, with the band's headroom to spare. */
const WIDE_ROW = 400;
/** What the pane reopens at — far wider than the width the promotion was decided at. */
const ROOMY_ROW = 1000;

type Phase = "tight" | "wide" | "reopened";

let phase: Phase = "tight";
/** Deciding passes since the row was widened — the collapse lands on the second. */
let widePasses = 0;
let faults: AdaptiveBarFault[] = [];

/**
 * What one occupant measures, as a function of the form it is CURRENTLY
 * rendering — read off the DOM, exactly as a layout engine would.
 *
 * The fillers are the ones whose content grows while the pane is shut: a widget
 * that finished loading behind a closed pane is the ordinary way a row comes
 * back wider than it went away.
 */
function widthOf(id: string, form: string): number {
  if (id === "p") return form === "compact" ? 50 : 100;
  if (form === "compact") return 40;
  return phase === "reopened" ? 900 : 100;
}

/**
 * The row's width, as a host that GIVES a width would report it.
 *
 * The slack probe reads the root twice in one pass — once holding the occupants
 * and once with them hidden — so the drag may only advance on a read taken while
 * the row still holds something, or the bar would be looking at a width that
 * follows its own content. That is `no-slack`, a different fault entirely.
 */
function measureRow(root: Element): number {
  if (phase !== "wide") return phase === "reopened" ? ROOMY_ROW : TIGHT_ROW;
  const holdsSomething = [
    ...root.querySelectorAll<HTMLElement>("[data-adaptive-bar-item]"),
  ].some((c) => c.parentElement === root && !c.hidden);
  if (holdsSomething) widePasses += 1;
  // The first pass at the wider row promotes and commits; the pane is shut
  // before the next one, which is where the record used to survive.
  return widePasses >= 2 ? 0 : WIDE_ROW;
}

function measureFake(el: Element): number {
  // `scroll` never evicts, so it never shows a trigger.
  if (el.hasAttribute("data-adaptive-bar-trigger")) return 0;
  const id = el.getAttribute("data-adaptive-bar-item");
  if (id === null) return measureRow(el);
  if (el.childElementCount === 0) return 0;
  const form =
    el.querySelector("[data-form]")?.getAttribute("data-form") ?? "full";
  return widthOf(id, form);
}

function Probe({
  id,
  yields,
}: {
  id: string;
  yields?: YieldEagerness;
}): ReactElement {
  const form = useActionForm({ shrinksTo: ["compact"], yields });
  return (
    <span data-probe={id} data-form={form}>
      {id}
    </span>
  );
}

/**
 * `scroll` mode, so nothing can leave the row: the claim is about which RUNG an
 * occupant is held at, and an eviction would answer a different question.
 *
 * `p` yields first, so the search takes it to its floor before asking either
 * filler for anything — which is what leaves a filler at its widest form when
 * the row can afford exactly one.
 */
function Bar(): ReactElement {
  return (
    // A fresh arrow every render, so a re-render re-runs the pass — the stand-in
    // for the ResizeObserver, which cannot fire in jsdom.
    <AdaptiveBarMeasure measure={(el) => measureFake(el)}>
      <AdaptiveBar gap="xs" label="Reopening" overflow="scroll">
        <AdaptiveBar.Item id="p">
          <Probe id="p" yields="early" />
        </AdaptiveBar.Item>
        <AdaptiveBar.Item id="f1">
          <Probe id="f1" />
        </AdaptiveBar.Item>
        <AdaptiveBar.Item id="f2">
          <Probe id="f2" />
        </AdaptiveBar.Item>
      </AdaptiveBar>
    </AdaptiveBarMeasure>
  );
}

/** The form an occupant is currently rendering — the rung, as the widget sees it. */
function formOf(id: string): string | null {
  return (
    document.querySelector(`[data-probe="${id}"]`)?.getAttribute("data-form") ??
    null
  );
}

beforeEach(() => {
  phase = "tight";
  widePasses = 0;
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

describe("a promotion is evidence only against the row it was decided on", () => {
  it("does not bar a rung after the pane collapsed and reopened wider", () => {
    const { rerender } = render(<Bar />);
    // The tight row cannot hold three widest forms, so everyone is compact.
    expect([formOf("p"), formOf("f1"), formOf("f2")]).toEqual([
      "compact",
      "compact",
      "compact",
    ]);

    // The row is given room: all three are promoted back to their widest form
    // and that placement is COMMITTED — which is what makes a promotion H2's
    // evidence in the first place. Then the pane shuts: the next pass reads 0px
    // and returns before it decides anything, so the record outlives the row it
    // was about.
    phase = "wide";
    widePasses = 0;
    rerender(<Bar />);
    expect([formOf("p"), formOf("f1"), formOf("f2")]).toEqual([
      "full",
      "full",
      "full",
    ]);

    // The pane reopens far wider, with the fillers' content grown behind it.
    // 1000px holds one 900px filler beside two compact occupants and nothing
    // more, so the fit seats `f1` at its widest — unless a bar stamped with THIS
    // width (a width that never rejected anything) is holding it down.
    phase = "reopened";
    rerender(<Bar />);
    expect(formOf("f1")).toBe("full");
    // And the two the row genuinely cannot afford are compact, so the assertion
    // above is the fit's answer rather than a row with room for everything.
    expect([formOf("p"), formOf("f2")]).toEqual(["compact", "compact"]);

    // A barred rung is not a fault, so nothing would have been reported either
    // way — which is exactly why this needs its own gate.
    expect(faults).toEqual([]);
    for (const id of ["p", "f1", "f2"]) {
      expect(
        document.querySelectorAll(`[data-adaptive-bar-item="${id}"]`),
      ).toHaveLength(1);
    }
  });
});
