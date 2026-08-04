# refresh

The Events app's **engine**: the only code that knows how a source becomes rows.
`events-core` owns the contracts, a source type owns the HTTP/LLM detail, this
owns everything between.

## `runSource` — the phase order, in one place

```
mark running → probe() → fingerprint === lastFingerprint ?
   yes → record run{unchanged}, bump the watermark, DONE      (extract never runs)
   no  → extract() → derive identities → upsert → stamp disappearances
       → record run{extracted}, store the fingerprint, bump the watermark
```

Two invariants the *shape* enforces:

- **`extract` is unreachable on a cache hit.** The engine — not the source type —
  holds `lastFingerprint`, so "don't pay for the model when nothing changed"
  cannot be forgotten by a future marketplace source type. `fingerprint: null` is
  never a hit — it declares "cannot probe cheaply", so that source always
  extracts; do not "simplify" the guard to a bare `===`, which would turn that
  declaration into a permanent skip.
- **Disappearance is stamped only after a successful full extraction** — the call
  sits inside the `try` after `extract`, so any failure exits before it, and a
  failed run also leaves `lastFingerprint` untouched (else the NEXT run skips
  extraction for material we never read).

## Identity is derived here, not per source type

`events` is unique on `(source_id, external_id)`, so identity IS idempotence. An
LLM extraction has no upstream id, and letting each type invent its own fallback
would make idempotence a per-provider discipline one of them gets wrong.
`external-id.ts` derives `sha256(sourceId + normalizedTitle + startsAt-as-UTC-date)`:
**day** granularity (a door time nudged 30 min is the same party), case/whitespace
folded — while next week's occurrence of a series is a different day, so a
different row.

`plan-writes.ts` is a **pure function** (no DB, clock, or randomness — even
`events.id` is derived), which is what makes the interesting half of the engine
unit-testable. It re-validates the extractor's output rather than trusting it,
collapses same-identity duplicates last-wins, and writes every absent optional as
an explicit `null` — the upsert's conflict path sets exactly the keys present, so
an omitted key would keep a price the venue removed on the row forever.

## Scheduling

`events.refresh-tick` — `*/15 * * * *`, `singleton`, **main-only**
(`perWorktree` unset). The cron job is the sanctioned no-polling exception (a
scraped page has no change signal to subscribe to). Main-only because worktrees
inherit events through the DB fork — a per-worktree schedule would have every
live agent worktree hammering the same third-party sites. "Refresh now" is a
normal endpoint and still works in any worktree.

Its whole decision is `enabled AND refresh <> 'manual' AND (next_run_at IS NULL OR
next_run_at <= now)`. `next_run_at` is the only watermark, so a cadence change
needs no cron edit; the NULL branch exists because `<= now` alone silently
strands a scheduled source that has no watermark.

`events.refresh-source` — `dedup: { key: sourceId }`, `maxAttempts: 3`: tick,
click, and retry coalesce onto one run rather than racing two model calls over
one page.

## Terminal vs transient

`classify-error.ts` is pure and matches on `error.name`, never `instanceof` —
both recognised classes set `name`, and a name check survives the module-identity
differences that would misclassify a terminal failure as transient.

`NonRetryableError`→`source`, `SsrfError`→`blocked_url`, `ZodError`→`extraction`,
`UnknownSourceTypeError`→`config` are terminal; **everything else is transient**
(guessing wrong costs a few retries, whereas guessing terminal parks a healthy
source until a human notices).

Terminal → source row parked `status: "error"` + classified message, rethrown as
`NonRetryableError` so graphile dead-letters after ONE attempt instead of paying
for three identical failures. Transient → detail stays on the run row
(`lastError` is terminal-only), source drops to `idle`, graphile retries. Either
way a `failed` run row is written and the job still throws: recording it is
reporting, not handling.

## The ledger is written at the end, not the start

`run-ledger.ts` is the only writer of `event_source_runs` and of a source row's
runtime state, and writes both **in one transaction** — a source that says
`error` always has the failed run explaining it. Inserting only at the end means
every ledger row is complete by construction; an in-flight run is already visible
as `status: "running"` on the live-pushed source row.

A backend killed mid-run leaves `running` set. That is cured, not swept:
`runSource` re-marks the row every run, and "Refresh now" **enqueues even when the
row says running** (reporting `already-running` only as a hint), because gating on
a row flag would make a wedged source permanently unrefreshable.

## Retention

Both sweeps live here, not in `events-core`, because this plugin owns the writes.
`events` disappeared > 90 d (a live event is `disappeared_at IS NULL`, structurally
out of reach of the predicate); `event_source_runs` > 30 d. Main-only — the
canonical DB is main's, a worktree fork is ephemeral.

Design: [`research/2026-08-03-apps-events-event-tracking-app.md`](../../../../../research/2026-08-03-apps-events-event-tracking-app.md).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Events refresh engine: the main-only cadence tick and the per-source refresh job, the probe/extract runSource pipeline (fingerprint cache → upsert diff → soft disappearance), the run ledger, terminal/transient error classification onto the source row, and the retention sweeps for events + runs.
- Server:
  - Uses:
    - `apps/events/events-core._eventSourceRuns`
    - `apps/events/events-core._eventSources`
    - `apps/events/events-core.EventSourceType`
    - `apps/events/events-core.eventsTable`
    - `apps/events/events-core.getEventSourceType`
    - `apps/events/events-core.markEventsDisappeared`
    - `apps/events/events-core.ProbeContext`
    - `apps/events/events-core.registerRefreshRunner`
    - `apps/events/events-core.requireSource`
    - `apps/events/events-core.upsertEvents`
    - `database.db`
    - `infra/jobs.defineJob`
    - `infra/jobs.NonRetryableError`
    - `infra/retention.defineRetention`
    - `primitives/log-channels.defineLogSink`
  - Exports (values):
    - `requestRefresh`
    - `runSource`
  - Register:
    - `defineJob('events.refresh-source')`
    - `defineJob('events.refresh-tick')`
    - `defineJob('retention.events')`
    - `defineJob('retention.event_source_runs')`

<!-- AUTOGENERATED:END -->
