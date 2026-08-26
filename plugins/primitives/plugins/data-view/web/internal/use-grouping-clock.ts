import { useEffect, useState } from "react";
import {
  addDays,
  startOfDay,
} from "@plugins/primitives/plugins/date-picker/core";

/** Local midnight of the current calendar day, as epoch ms. */
function localMidnight(): number {
  return startOfDay(new Date()).getTime();
}

/**
 * The `now` every grouping plans against: local midnight of the current day.
 *
 * Two jobs, both structural rather than cosmetic.
 *
 * **Quantized.** A grouping is planned inside a `useMemo`; a raw `Date.now()`
 * would change the memo key on every render and re-partition the whole set each
 * time. Local midnight only changes when the answer to "is this today?" changes,
 * so the memo holds for a whole day.
 *
 * **Re-armed at the boundary.** A view left open overnight would otherwise keep
 * saying "Today" about yesterday. One `setTimeout` fires at the next local
 * midnight, bumps the value, and re-arms.
 *
 * That timer is **not** the polling the repo bans. The rule is against
 * `setInterval`/`setTimeout` loops that wake up to *check whether something
 * changed*; this one fires exactly at the instant the value changes, and that
 * instant is known in advance because it is a property of the calendar. There is
 * nothing to poll: no source to ask, no comparison on wake, and one timer per
 * mounted DataView for a whole day.
 */
export function useGroupingClock(): number {
  const [now, setNow] = useState(localMidnight);
  useEffect(() => {
    // Next local midnight, computed through the calendar (`addDays` + setters)
    // rather than `now + 86_400_000`, so a DST transition still lands on the
    // real boundary. The extra second keeps a timer that fires a hair early
    // (timer resolution) from re-arming on the same day it just left.
    const next = startOfDay(addDays(new Date(now), 1)).getTime() + 1_000;
    const timer = setTimeout(
      () => setNow(localMidnight()),
      Math.max(0, next - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [now]);
  return now;
}
