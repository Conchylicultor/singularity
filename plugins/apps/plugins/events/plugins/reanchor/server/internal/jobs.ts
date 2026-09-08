import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { reanchorRecurringEvents } from "@plugins/apps/plugins/events/plugins/events-core/server";

/**
 * Roll every recurring event's occurrence columns forward to its next
 * occurrence.
 *
 * **Why a schedule and not a subscription.** The change signal here is the
 * passage of time — a series goes stale because a date arrived, not because
 * anything wrote a row — so there is nothing to LISTEN to. That is the
 * documented exception to the no-polling rule, and a scheduled `defineJob` is
 * the sanctioned mechanism (the `events.refresh-tick` beside it sets the
 * precedent); an in-process timer never is.
 *
 * **Why hourly rather than daily.** What the filters actually need is that the
 * anchors are right for the day the user is looking at, so one tick just after
 * local midnight would be enough — except that cron here is UTC (so "local
 * midnight" is not expressible as a cron line) and, more importantly, graphile's
 * cron does NOT backfill a tick missed while the process was down. A laptop
 * asleep at the one nightly slot would therefore have the list wrong for the
 * whole following day, which is precisely the bug. Hourly makes the correction
 * follow the machine rather than the clock: whenever it wakes, the list is right
 * within the hour, and the timezone question disappears because the SWEEP reads
 * the local day, not the cron line.
 *
 * The tick is close to free: it selects on `(recurring, starts_at)` and matches
 * nothing at all except in the hour after a series' occurrence passes.
 *
 * Main-only (`perWorktree` left unset), like the refresh tick. A worktree
 * inherits events through the DB fork and re-anchors its own copy once at boot
 * (see this plugin's `onReady`), which is all an ephemeral checkout needs.
 */
export const reanchorEventsJob = defineJob({
  name: "events.reanchor",
  // instant: one indexed select plus, in the rare non-empty case, a handful of
  // single-row updates. No fetching, no model call, no source contacted.
  hold: "instant",
  // Cron payloads are built from `input.parse({})`, so this must parse `{}`.
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "0 * * * *" },
  maxAttempts: 3,
  run: async () => {
    await reanchorRecurringEvents(new Date());
  },
});
