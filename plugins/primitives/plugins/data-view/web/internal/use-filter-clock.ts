import { useDayClock } from "./use-grouping-clock";

/**
 * The `now` an in-memory filter lowers against: local midnight as epoch ms.
 *
 * Re-renders once at the next local midnight — and ONLY while `readsClock`
 * (`lowerFilterGroup`'s answer: some rule used a relative date anchor such as
 * "Today"). A filter over absolute values schedules nothing. The re-render is
 * one timer to a known instant (the calendar's next day boundary), not a poll:
 * see `useGroupingClock` for why that is not the polling the repo bans. The
 * timer is cleared on unmount and whenever the filter stops reading the clock.
 */
export function useFilterClock(readsClock: boolean): number {
  return useDayClock(readsClock);
}
