import { queryDeadlineSink } from "@plugins/database/server";
import { recordReport } from "@plugins/reports/server";
import { createQueryDeadlineHandler } from "./handler";
import { dbQueryDeadlinesServerResource, deadlineHitRing } from "./resource";

/**
 * Route the database plugin's deadline announcements into reports and the
 * Database health row.
 *
 * Registered in `onReady` and cleared in `onShutdown`, like
 * `jobs/deadline-audit`. The seam is a fire-and-forget report sink that HOLDS
 * what is emitted before a handler registers, so a deadline that fires during
 * boot is replayed here rather than lost.
 */
export function registerQueryDeadlineReports(): void {
  queryDeadlineSink.register(
    createQueryDeadlineHandler({
      recordReport,
      ring: deadlineHitRing,
      notify: () => dbQueryDeadlinesServerResource.notify(),
    }),
  );
}

export function unregisterQueryDeadlineReports(): void {
  queryDeadlineSink.register(null);
}
