import { defineReportSink } from "@plugins/primitives/plugins/report-sink/core";

/**
 * The ways an adaptive bar is *wrong*, as opposed to merely cramped.
 *
 * Running out of room is the normal case and is never a fault — it is what the
 * whole primitive is for. These four are the states where the bar's own
 * assumptions have been violated, and living with them silently is how a layout
 * bug becomes permanent.
 */
export type AdaptiveBarFaultKind =
  /** The bar was not given slack: some ancestor is shrink-to-content, or a sibling took the grow slot. */
  | "no-slack"
  /** The fit said "everything fits" and the rendered row still sticks out past its parent. */
  | "overshoot"
  /** `MAX_PASSES` measure→decide rounds and the answer still changed. */
  | "no-convergence"
  /** A container holds an `<iframe>` and this browser has no `moveBefore`, so relocating it would reload it. */
  | "iframe-relocation";

export interface AdaptiveBarFault {
  kind: AdaptiveBarFaultKind;
  /** The bar's accessible label — the only name a generic primitive has for itself. */
  label: string;
  message: string;
}

/**
 * Where a fault goes in production. A domain plugin (`reports`) registers the
 * mapping to a filed report; with nothing registered, `emit` is a no-op — which
 * is correct for a primitive that must stay usable in a test harness, a fixture
 * page and a standalone story.
 */
export const adaptiveBarReportSink = defineReportSink<AdaptiveBarFault>();

/**
 * Report and keep going. For a fault the *browser* caused rather than the
 * caller: refusing to relocate an iframe is the right behaviour, not a bug to
 * take a pane down over.
 */
export function reportFault(fault: AdaptiveBarFault): void {
  adaptiveBarReportSink.emit(fault);
}

/**
 * Report, then throw in dev.
 *
 * For the faults that mean the bar's own contract is broken — it was given no
 * slack, or its fit math disagrees with the layout engine. Those must not be
 * lived with: in dev the throw is the fastest possible feedback, and in prod we
 * file the alert and take the floor layout instead, because taking down a pane
 * header over a layout disagreement is worse than a cramped row plus a report.
 *
 * The caller applies the floor BEFORE calling this, so the two orders are not
 * interchangeable: throwing first would leave the row in the state that was
 * already known to be wrong.
 */
export function failLoudly(fault: AdaptiveBarFault): void {
  reportFault(fault);
  if (import.meta.env.DEV) {
    throw new Error(`adaptive-bar (${fault.label}): ${fault.message}`);
  }
}

/**
 * How many measure→decide rounds one resize episode may take before we stop
 * believing the algorithm. Four is generous: a converging pass costs one rung
 * step, and the ladder is at most three rungs deep.
 */
export const MAX_PASSES = 4;

/**
 * The promote band, in px — one `gap-sm`. A demotion is accepted the moment the
 * row overflows; a promotion needs this much headroom on top. The two
 * predicates are disjoint, so no single width both demands a demote and permits
 * the matching promote, which is what stops a one-pixel resize from flickering
 * the row back and forth.
 */
export const HYSTERESIS_PX = 8;
