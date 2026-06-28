-- Custom SQL migration file, put your code below! --
-- migration: 20260628_234246__dismiss_legacy_report_notifs --

-- One-time cleanup of the report-notification tombstone pileup.
--
-- Before this change, recurring report notifications (slow-op, op-rate, ...) were
-- keyed by (reportId, timeBucket), so every re-arm window spawned a brand-new
-- undismissed row. That grew the undismissed `notifications` set to ~21.8k rows
-- (96% of them slow-op / op-rate), which the live-state `notifications` resource
-- serialized into a single ~1.88 MB jsonb blob and re-snapshotted + re-delivered
-- on every change — the dominant driver of the flush cascade, the 112 MB
-- live_state_snapshot TOAST bloat, and multi-second snapshot UPSERTs / deliveries.
-- See research/perfs/2026-06-29-notifications-unbounded-resource-root-cause.md.
--
-- Going forward each report keeps exactly one row per fingerprint (dedupeKey =
-- report id) that re-surfaces in place. These legacy time-bucketed rows are pure
-- tombstones — the reports table remains the durable ledger — so we dismiss them.
-- Any still-active fingerprint re-forms a single fresh row on its next occurrence.
-- Dismissed rows are hard-deleted by the existing 7-day TTL sweep.
UPDATE notifications
SET dismissed = true
WHERE type = 'report'
  AND dismissed = false;
