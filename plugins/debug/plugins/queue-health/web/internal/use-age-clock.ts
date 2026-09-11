import { useEffect, useState } from "react";
import { msUntilDurationChanges } from "../../shared/format-duration";

/**
 * The `now` a list of live ages ("running 2m 03s", "waiting 14s") is drawn
 * against, advanced exactly when one of those strings would change.
 *
 * `anchors` are the instants the ages count from (epoch ms). One `setTimeout`
 * fires at the soonest moment any `formatDurationMs(now − anchor)` rolls over —
 * the next whole second under an hour, the next whole minute past it — bumps
 * `now`, and re-arms. With no anchors there is no timer.
 *
 * Not the polling the repo bans, for the reason `useGroupingClock` gives: it
 * wakes at the instant the displayed value changes, a property of the clock
 * known in advance, with nothing to ask and no comparison on wake. It is mounted
 * only by the row's expanded detail, never by `useStatus`, so a closed report
 * runs no timer at all.
 */
export function useAgeClock(anchors: readonly number[]): number {
  const [now, setNow] = useState(() => Date.now());
  // A primitive dependency, so a new-but-equal array from a re-render does not
  // re-arm the timer.
  const key = anchors.join(",");
  useEffect(() => {
    if (key === "") return;
    const current = Date.now();
    const delay = Math.min(
      ...key
        .split(",")
        .map((anchor) => msUntilDurationChanges(current - Number(anchor))),
    );
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [key, now]);
  return now;
}
