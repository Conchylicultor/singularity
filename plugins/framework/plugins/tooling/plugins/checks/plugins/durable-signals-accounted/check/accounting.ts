// The classification of every DURABLE sink in the repo: each `defineLogSink({ id })`
// log channel and each bare `defineFileSink({ id })` file (the only durable form
// a CLI process can use). Local to this check ON PURPOSE: the low-level sink
// primitives (log-channels, file-sink) must never name reports or the timeline
// (dependency inversion), and a registry refactor onto the primitives themselves
// was rejected as disproportionate (~25 sinks for a guardrail). So the
// classification lives here, and the check enforces that every durable sink is
// a CONSCIOUS, REVIEWED choice — not that every sink must be a report (health is
// continuous), only that a new durable signal cannot appear un-classified.
//
// Ids are one namespace across both primitives (a defineLogSink channel owns a
// file sink under its own id; the check fails if both declare one id).
//
// `consumer` is the primary classification. The check enforces:
//   • report      → MUST carry a `reportKind` that resolves to a live
//                    `ReportKind({ kind })` call site.
//   • timeline     → MUST carry a `timelineSource` in TIMELINE_SOURCES.
//   • rendering-only / internal → no wiring assertion, but the `note` must say
//                    honestly what reads it (or that nothing durable does).
// A sink may ALSO carry the other field (boot / duress-episodes feed BOTH a
// report and the timeline); whichever fields are present are validated.

export type SinkConsumer =
  "report" | "timeline" | "rendering-only" | "internal";

export interface SinkAccounting {
  consumer: SinkConsumer;
  note: string;
  /** For report (or dual) sinks: the ReportKind this sink's records file. */
  reportKind?: string;
  /** For timeline (or dual) sinks: the TimelineSource this sink feeds. */
  timelineSource?: string;
}

export const ACCOUNTING: Record<string, SinkAccounting> = {
  // ── Durable FAILURE signals: report + timeline (the front door). ──────────
  boot: {
    consumer: "report",
    reportKind: "boot-wedge",
    timelineSource: "boot",
    note: "Per-boot start/ready lines (boot-events). A never-ready boot files the boot-wedge report (debug/boot-watchdog) AND renders as a timeline boot bar.",
  },
  "duress-episodes": {
    consumer: "report",
    reportKind: "duress-episode",
    timelineSource: "duress",
    note: "Sentinel duress trip/clear lines. Each episode files the duress-episode report (on clear) AND renders as a timeline duress band.",
  },
  "worktree-removal": {
    consumer: "report",
    reportKind: "worktree-removed-externally",
    note: "Worktree checkout removal audit (infra/worktree/removal-audit). Two line kinds: `in-app` (every removeWorktree call, with caller) is forensic detail, and `disappeared` is the signal — a checkout that vanishes with no in-app line claiming it files the worktree-removed-externally report. The in-app lines exist to make that NEGATIVE evidence conclusive: without them, 'nothing we did explains this' is an inference rather than a fact. Deduped per worktree name so a burst (the 2026-08-09 event took 22 checkouts) collapses onto one task.",
  },

  "check-progress": {
    consumer: "report",
    reportKind: "check-thread-stall",
    note: "Per-check-run progress log (defineFileSink, checks/core/progress-log.ts; CLI-only, host-global). Thread-stall records of 2 s or more and run totals of 20 s or more are filed as check-thread-stall reports through the report outbox at write time. Also read back by `./singularity check --status` (runs that never finished) and by the build/push parent to place a check subprocess's spans on its op lane.",
  },

  // ── Continuous health series: timeline heat strips (never a report). ──────
  health: {
    consumer: "timeline",
    timelineSource: "health",
    note: "Per-backend health samples (health-monitor). Downsampled into the timeline per-lane health heat strip; also the Debug → Health pane. Continuous, so never a report.",
  },
  "health-host": {
    consumer: "timeline",
    timelineSource: "health",
    note: "Host vitals — loadavg / compressor / memory (health-monitor host sampler). Feeds the timeline host-lane pressure heat; also read by the sentinel for the compressor signal and the Health pane. Continuous, so never a report.",
  },

  // ── Rendering-only: read by a specific debug pane, no failure funnel. ─────
  "slow-op-markers": {
    consumer: "rendering-only",
    note: "Per-worktree slow-op markers overlaid on the Debug → Health pane (readSlowOpMarkers). The durable slow-op SIGNAL is the slow-op report filed on the DB path by the same recorder; this channel is display-only.",
  },
  release: {
    consumer: "rendering-only",
    note: "Local release-run logs, streamed into the Studio release-logs pane. A release progress log, not a failure funnel.",
  },
  deploy: {
    consumer: "rendering-only",
    note: "`singularity deploy converge|ship` output, streamed into the Deploy app's Deployments section. A deploy progress log, not a failure funnel: a failed run's own verdict is the CLI's message, surfaced on the deployment row via the `deploy.runs` live resource — the human is watching the run they just started, so it needs no alert funnel.",
  },

  "op-log": {
    consumer: "rendering-only",
    note: "Unified host op log (defineFileSink, debug/profiling/op-log): requested/granted/completed phases of every build / push / check. Read back through the sink's bounded tail reader by the Debug → Profiling ops Gantt + op detail, and by stats/pushes. A profiling record, not a failure funnel.",
  },
  "signal-origin": {
    consumer: "rendering-only",
    note: "Who killed an op (defineFileSink, cli/op-runtime signal-origin-log; CLI-only, host-global): one line per catchable fatal signal reaching build/check/push, plus arm failures. Read by build/build-termination's endpoint and shown as the termination detail on a build run (build-info). The durable 'this build died' fact is the build run's own outcome; this names the sender.",
  },

  // ── Internal diagnostics: human-readable prose, no durable consumer. ──────
  sentinel: {
    consumer: "internal",
    note: "Sentinel onset TRIP/CLEAR + worker supervision prose. The durable duress signal is the duress-episodes channel (report + timeline); this is diagnostic prose.",
  },
  duress: {
    consumer: "internal",
    note: "Shed-buffer accounting prose (infra/host/duress). The durable shed record is the duress-shed report; this is the buffer's own log.",
  },
  "paging-probe": {
    consumer: "internal",
    note: "Config-gated (OFF by default) twin-probe child stderr drain. The probe MEASUREMENTS go to paging-probe-<variant>.jsonl (read offline), not this channel.",
  },
  "mcp-page-instructions": {
    consumer: "internal",
    note: "One line per MCP initialize with the length of the page-instructions section (page/annotations/agent-access), read by hand when checking whether a client truncates the global instructions. Not a failure signal.",
  },
  notifications: {
    consumer: "internal",
    note: "Boot-time notifications read-set reconciliation diagnostics (shell/notifications). Not a failure signal.",
  },
  "events-test-detached-sleep": {
    consumer: "internal",
    note: "Transcript of the infra/events-test detached-sleep harness (supervised-job restart-survival probe); read by hand while verifying, nothing consumes it.",
  },
  "worktree-cleanup": {
    consumer: "internal",
    note: "Stale-worktree/DB-fork reap-job diagnostics (debug/worktree-cleanup).",
  },
  "database-fork": {
    consumer: "internal",
    note: "Detached database.fork child transcript (database/fork); failures surface via the DB-fork-failed notification and the job dead-letter.",
  },
  "chord-song-index": {
    consumer: "internal",
    note: "Detached chord.song-index.load child transcript (apps/chord/song-index): download, snapshot build and section load timings. Failures surface as the index status `failed` (its state row) and the job dead-letter.",
  },
  "chord-video-check": {
    consumer: "internal",
    note: "On-demand oEmbed checks that settled nothing (apps/chord/video-availability): no answer (timeout, network) or a code that says nothing about the video. Forensic only — nothing durable reads it. By design such a check fails open: the video stays `unknown`, the loop is still offered, and the next query or the player's own report settles it, so a stuck YouTube shows as rows that never leave `unknown` in chord_video_status_v, not as a report.",
  },
  "slow-ops": {
    consumer: "internal",
    note: "One line per client slow-op batch that arrived with a non-zero browser-side drop count (the beacon queue hit its 1000-item cap). Accounting for signals that never reached the recorder, so the loss is not silent; the durable slow-op SIGNAL itself is the slow-op report filed by the recorder.",
  },
  db: {
    consumer: "internal",
    note: "Database client diagnostics — slow acquires, pool events (database).",
  },
  "change-feed": {
    consumer: "internal",
    note: "DB change-feed trigger/listener diagnostics (database/change-feed).",
  },
  "derived-tables": {
    consumer: "internal",
    note: "Derived rollup-table rebuild diagnostics on boot (database/derived-tables).",
  },
  "derived-views": {
    consumer: "internal",
    note: "Derived-view rebuild diagnostics on boot (database/derived-views).",
  },
  "live-state-snapshot": {
    consumer: "internal",
    note: "Live-state snapshot boot-init + changelog catch-up diagnostics (database/live-state-snapshot).",
  },
  migrations: {
    consumer: "internal",
    note: "Migration runner diagnostics (database/migrations).",
  },
  "mail-sync": {
    consumer: "internal",
    note: "Gmail sync engine ops log — bootstrap / backfill / delta / attachment-scan caps and recoveries (apps/mail/sync tick, backfill, attachment-scan jobs). Diagnostic prose; no durable failure funnel.",
  },
  "events-refresh": {
    consumer: "internal",
    note: "Events refresh engine cadence-tick accounting plus the non-runs (source deleted or disabled between enqueue and dispatch). Diagnostic prose covering only what the ledger structurally cannot: every run that actually happened is a durable `event_source_runs` row, and a failed one also parks the classified error on the source row — both surfaced in the app, so this channel is not the failure funnel.",
  },
  "build-progress": {
    consumer: "internal",
    note: "Per-build progress log (defineFileSink, cli/op-runtime build-progress; CLI-only, host-global): span enter/leave with RSS, heartbeat, completion. Read back only by a waiting build's checkout-lock message to name what the lock holder is stuck in, and by humans investigating a wedge. No durable consumer.",
  },
  "client-log": {
    consumer: "internal",
    note: "Representative family bound (defineFileSink, log-channels client-ingress) for the browser clientLog channels written through openDynamicSink. Makes the open-ended family enumerable in getFileSinks(); the file itself is written only if a browser names a channel `client-log`. The per-channel files are debug logs read by humans (tail) and the Debug → Logs viewer; no failure funnel.",
  },
};
