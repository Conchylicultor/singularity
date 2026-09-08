import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { reanchorRecurringEvents } from "@plugins/apps/plugins/events/plugins/events-core/server";
import { reanchorEventsJob } from "./internal/jobs";

export default {
  description:
    "Keeps a recurring event's occurrence columns (starts_at / ends_at / all_day) current as time passes: the hourly re-anchor tick plus the boot pass, so an 'upcoming' filter never drops a series that is still running just because its source has not been re-extracted since the last occurrence.",
  register: [reanchorEventsJob],
  // The boot pass, and the reason it is not left to the schedule: cron does not
  // backfill a tick missed while the process was down, so a backend starting
  // after a long sleep would serve stale anchors until the next hour boundary.
  // It also covers the worktree case, where the main-only schedule never fires.
  //
  // `onReady`, not `onReadyBlocking`: a stale anchor degrades one list, it does
  // not make the backend wrong to serve, so it must not hold up boot. Nothing is
  // caught here either — this plugin is not `loadBearing`, so the framework
  // already logs a rejection and keeps serving, which is the degradation we
  // want. Catching it locally would only hide a DB failure the log should carry.
  onReady: async () => {
    await reanchorRecurringEvents(new Date());
  },
} satisfies ServerPluginDefinition;
