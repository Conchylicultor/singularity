import type { ReactElement } from "react";
import { useNow } from "@plugins/primitives/plugins/relative-time/web";
import { formatUntil } from "../internal/present";

// A countdown only needs to be as fine as its coarsest unit shown near the
// top of a minute; the value itself is pushed, this only re-reads the clock.
const TICK_MS = 15_000;

/** "next in 4m" — the time until a scheduled run, kept current on screen. */
export function NextRun({ at }: { at: Date }): ReactElement {
  const now = useNow(TICK_MS);
  return <>next {formatUntil(at, now)}</>;
}
