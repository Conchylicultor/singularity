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

/**
 * Which surface is asking for a FIXED keyboard height: only the roll's gutter.
 *
 * There used to be a `"chip"` height too — a readout keyboard pinned to 44px
 * whatever its width, so its keys squashed as the panel narrowed. A readout now
 * sizes itself by the plane's `aspect` (the keyboard primitive's
 * `sizing="proportional"`), and the fixed chip height has no spelling left.
 */
export type PitchKeyboardSize = "keybed";

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
   * How wide, in key-widths, a snapped range lays out — and the width ÷ height
   * of that keyboard at its keys' natural proportion. Written onto the plane so
   * a surface can size a keyboard without knowing the layout.
   */
  proportion(low: number, high: number): { span: number; aspect: number };
  /**
   * The keybed height this layout wants, in px. A deliberate per-layout
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
  // From the SNAPPED range: the proportion describes the pads actually drawn.
  const { span, aspect } = impl.proportion(range.low, range.high);
  return markLaidOut({
    layout,
    low: range.low,
    high: range.high,
    keys: laid.keys,
    columns: laid.columns,
    guides: laid.guides,
    span,
    aspect,
  });
}

/** The keybed height a layout wants, in px. */
export function pitchKeyboardHeight(
  layout: PitchLayoutId,
  size: PitchKeyboardSize,
): number {
  return PITCH_LAYOUTS[layout].heights[size];
}
