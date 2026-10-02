import noUnlistedTimer from "./no-unlisted-timer";

export default {
  name: "timer",
  rules: {
    "no-unlisted-timer": noUnlistedTimer,
  },
  ignores: {
    // The register of in-process loops. A timer is not a polling escape hatch
    // (CLAUDE.md "No polling"): add a file here only with the reason a job,
    // watcher or event cannot do the work.
    "no-unlisted-timer": [
      // Central runtime: it has no job queue, so its one periodic task (refresh
      // OAuth tokens before they expire) can only be a timer.
      "plugins/auth/central/internal/refresh-loop.ts",
      // The job queue's own recovery: a queued sweeper could not run while the
      // wedged worker it exists to free holds the queue.
      "plugins/infra/plugins/jobs/server/internal/stuck-lock-sweeper.ts",
      // The queue's alarm: a queued watchdog would sit in the backlog it exists
      // to report (2026-08-17: eleven copies of it did).
      "plugins/debug/plugins/queue-health/server/internal/watchdog.ts",
      // Reports requests / steps stuck in THIS process's profiler, every 15 s —
      // must run while the queue is wedged, and below cron's 1-minute floor.
      "plugins/debug/plugins/stuck-spans/server/internal/watchdog.ts",
      // Samplers of this process / the host every 10 s: the instrument for a
      // wedged backend, below cron's 1-minute floor.
      "plugins/debug/plugins/health-monitor/server/internal/process-sampler.ts",
      "plugins/debug/plugins/health-monitor/server/internal/host-sampler.ts",
      // TEMPORARY shadow audit, pending deletion: the retired 1 s status
      // poller, now writing nothing and only reporting a state change no push
      // signal delivered within 2 s. Delete it (and this line) once its
      // reports are empty or explained
      // (research/2026-10-02-conversations-poller-push-status.md).
      "plugins/conversations/server/internal/status-shadow-audit.ts",
    ],
  },
};
