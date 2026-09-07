import {
  markLaidOut,
  type PitchColumn,
  type PitchGuide,
  type PitchKey,
  type PitchLayoutId,
  type PitchPlane,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { pianoLayout } from "./piano";
import { jankoLayout } from "./janko";

/**
 * The one entry point to pitch geometry: {@link pitchGeometry} snaps a range and
 * lays it out, and is the ONLY producer of a {@link PitchPlane}.
 *
 * The layouts behind it are a closed `Record<PitchLayoutId, PitchLayout>`, so a
 * third layout added to the id union is a tsc error here until it answers for
 * every question a surface can ask — how to snap a range, where the pads go, and
 * how tall a keybed it wants. No slot, no sub-plugin per layout: the set is
 * enumerable today, which per the root CLAUDE.md rule makes it plain data.
 */

/** Which surface is asking for a keyboard: the roll's gutter, or a readout chip. */
export type PitchKeyboardSize = "keybed" | "chip";

/**
 * One layout's whole answer. Internal — a consumer reaches every layout through
 * {@link pitchGeometry}, never by name, so adding one changes no call site.
 */
export interface PitchLayout {
  /**
   * Widen `[low, high]` to a range this layout can tile flush. Must be
   * IDEMPOTENT and may only WIDEN — a surface hands over the range it wants to
   * show and gets back the range it will actually get, and re-snapping a
   * snapped range must be a no-op or the plane's `low`/`high` would drift on
   * every recompute.
   */
  snapRange(low: number, high: number): { low: number; high: number };
  /** Lay out an already-snapped range. Pure. */
  lay(
    low: number,
    high: number,
  ): { keys: PitchKey[]; columns: PitchColumn[]; guides: PitchGuide[] };
  /**
   * The keybed / chip height this layout wants, in px. A deliberate per-layout
   * CHOICE, not a formula: four rows of Jankó pads need more room than one row
   * of piano keys, and no ratio derives that.
   */
  heights: Record<PitchKeyboardSize, number>;
}

const PITCH_LAYOUTS: Record<PitchLayoutId, PitchLayout> = {
  piano: pianoLayout,
  janko: jankoLayout,
};

/**
 * Snap the range, lay it out, brand the result. Pure, and the only way to
 * obtain a {@link PitchPlane} — see the brand's note in `score/core`.
 *
 * The returned `low`/`high` are the SNAPPED range, which may be wider than what
 * was asked for. Callers that iterate pitches (a keyboard's lit map, say) must
 * walk `plane.low..plane.high` rather than their own request, or a layout that
 * widened will leave pads unaccounted for.
 */
export function pitchGeometry(
  layout: PitchLayoutId,
  low: number,
  high: number,
): PitchPlane {
  const impl = PITCH_LAYOUTS[layout];
  const range = impl.snapRange(low, high);
  const laid = impl.lay(range.low, range.high);
  return markLaidOut({
    layout,
    low: range.low,
    high: range.high,
    keys: laid.keys,
    columns: laid.columns,
    guides: laid.guides,
  });
}

/** The keybed / chip height a layout wants, in px. */
export function pitchKeyboardHeight(
  layout: PitchLayoutId,
  size: PitchKeyboardSize,
): number {
  return PITCH_LAYOUTS[layout].heights[size];
}
