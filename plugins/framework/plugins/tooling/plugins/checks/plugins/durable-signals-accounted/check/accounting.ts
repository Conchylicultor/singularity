// The classification of every DURABLE log channel (`defineLogSink({ id })`) in
// the repo. Local to this check ON PURPOSE: a low-level channel primitive
// (log-channels) must never name reports or the timeline (dependency
// inversion), and a registry refactor onto `defineLogSink` itself was rejected
// as disproportionate (~18 channels for a guardrail). So the classification
// lives here, and the check enforces that every durable channel is a CONSCIOUS,
// REVIEWED choice — not that every channel must be a report (health is
// continuous), only that a new durable signal cannot appear un-classified.
//
// `consumer` is the primary classification. The check enforces:
//   • report      → MUST carry a `reportKind` that resolves to a live
//                    `ReportKind({ kind })` call site.
//   • timeline     → MUST carry a `timelineSource` in TIMELINE_SOURCES.
//   • rendering-only / internal → no wiring assertion, but the `note` must say
//                    honestly what reads it (or that nothing durable does).
// A channel may ALSO carry the other field (boot / duress-episodes feed BOTH a
// report and the timeline); whichever fields are present are validated.

export type ChannelConsumer = "report" | "timeline" | "rendering-only" | "internal";

export interface ChannelAccounting {
  consumer: ChannelConsumer;
  note: string;
  /** For report (or dual) channels: the ReportKind this channel's lines file. */
  reportKind?: string;
  /** For timeline (or dual) channels: the TimelineSource this channel feeds. */
  timelineSource?: string;
}

export const ACCOUNTING: Record<string, ChannelAccounting> = {
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

  // ── Internal diagnostics: human-readable prose, no durable consumer. ──────
  sentinel: {
    consumer: "internal",
    note: "Sentinel onset TRIP/CLEAR + worker supervision prose. The durable duress signal is the duress-episodes channel (report + timeline); this is diagnostic prose.",
  },
  duress: {
    consumer: "internal",
    note: "Shed-buffer accounting prose (infra/duress). The durable shed record is the duress-shed report; this is the buffer's own log.",
  },
  "paging-probe": {
    consumer: "internal",
    note: "Config-gated (OFF by default) twin-probe child stderr drain. The probe MEASUREMENTS go to paging-probe-<variant>.jsonl (read offline), not this channel.",
  },
  notifications: {
    consumer: "internal",
    note: "Boot-time notifications read-set reconciliation diagnostics (shell/notifications). Not a failure signal.",
  },
  "worktree-cleanup": {
    consumer: "internal",
    note: "Stale-worktree/DB-fork reap-job diagnostics (debug/worktree-cleanup).",
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
};
