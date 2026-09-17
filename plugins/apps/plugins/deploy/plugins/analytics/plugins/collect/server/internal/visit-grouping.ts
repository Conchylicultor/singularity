/**
 * A visit is a run of activity from one daily visitor hash with no gap of
 * {@link VISIT_IDLE_TIMEOUT_MS} or more. Activity is a pageview, an event, or an
 * engagement beacon (the tab being hidden is proof someone was on it).
 */
export const VISIT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** A visit whose `lastAt` is strictly after this instant is still live at `now`. */
export function liveVisitCutoff(now: Date): Date {
  return new Date(now.getTime() - VISIT_IDLE_TIMEOUT_MS);
}

/** Whether a hit at `now` continues a visit last active at `lastAt`. */
export function continuesVisit(lastAt: Date, now: Date): boolean {
  return lastAt.getTime() > liveVisitCutoff(now).getTime();
}
