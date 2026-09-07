import { useMemo } from "react";
import { useConfig } from "@plugins/config_v2/web";
import type { PitchPlane } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { asPitchLayoutId, pitchLayoutConfig } from "../../core/config";
import { pitchGeometry } from "../../core/geometry";

/**
 * The ACTIVE layout's plane for a requested range — the one read every renderer
 * of a keyboard makes, so none of them holds a second opinion about which
 * layout is on.
 *
 * Memoized on `(layout, low, high)`, which is load-bearing rather than
 * housekeeping: the drawn key skin memoizes its generated SVG paths on the pad
 * ARRAY IDENTITY, so a fresh plane per render would rebuild every path every
 * frame.
 *
 * The range asked for is a request, not a promise — read `plane.low`/`plane.high`
 * back if you need to iterate the pitches you actually got (see `snapRange`).
 */
export function usePitchGeometry(low: number, high: number): PitchPlane {
  const { layout } = useConfig(pitchLayoutConfig);
  const id = asPitchLayoutId(layout);
  return useMemo(() => pitchGeometry(id, low, high), [id, low, high]);
}
