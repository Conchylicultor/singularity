# query-deadline

Makes a lost database query visible. When a query on the app pool gets no answer
before its deadline, the database plugin fails the caller and abandons the
connection; this plugin turns that into a report (Debug → Reports + the bell) and
into the health report's **Database** row.

Background: [`research/2026-09-11-global-query-deadline-and-stall-health.md`](../../../../research/2026-09-11-global-query-deadline-and-stall-health.md)
(Part 2) and the incident it answers,
[`research/2026-09-11-global-live-updates-frozen-by-stray-fd-close.md`](../../../../research/2026-09-11-global-live-updates-frozen-by-stray-fd-close.md).

## Why it is a sub-plugin and not part of `database`

`reports` imports `database` (it writes its rows through `db`), so `database`
cannot file reports without a cycle. The database plugin owns the mechanism —
the deadline, `abandonClient`, and the `queryDeadlineSink` seam it emits to — and
this plugin owns the interpretation. Same split, same reason, as
`infra/jobs` → `infra/jobs/deadline-audit`. The child imports the parent
(`queryDeadlineSink`, `QueryDeadlineEvent` from `@plugins/database/server`); the
parent never imports the child.

The seam is a fire-and-forget `defineReportSink`, registered in `onReady` and
cleared in `onShutdown`. It holds what is emitted before registration, so a
deadline that fires during boot is replayed rather than lost.

## The two kinds

Both `variant: "error"`, `duressExempt: true`, and re-alert the bell at most
every 10 minutes per row. Source is `server-caught`: the deadline is an error
caught in-process, not a monitor's finding.

| kind | one row per | fires when |
| --- | --- | --- |
| `db-query-deadline` | query label (per worktree) | a query got no answer before its deadline; its connection was abandoned |
| `db-abandon-cap` | worktree (fixed fingerprint) | the process abandoned more connections than the database plugin's hold set is sized for |

Two kinds, not one kind with two fingerprints: they are different facts with
different shapes (one lost query vs. what the lost queries add up to), and one
schema describing both would make every field optional.

**`duressExempt`.** A lost query and a host in trouble are often the same
event. Without the flag the reports funnel would shed exactly the reports that
describe the outage. Volume stays bounded without the gate: each lost query
costs a full deadline, and repeats dedupe onto their row.

**No renderer restates a bound.** Every duration printed — the wait, the
deadline — arrives in the payload from the database plugin. A report records
what was true when it was filed; re-deriving `60s` at render time would let an
edit to the default silently rewrite past reports.

**Kind strings are spelled once**, in `core/` (`DB_QUERY_DEADLINE_KIND`,
`DB_ABANDON_CAP_KIND`), and used by both the server's `ReportKind` and the web's
`Reports.KindView`, so the two cannot drift apart.

## The ring and the `db-query-deadlines` resource

The server keeps the last 20 deadline hits (`{ at, sql, elapsedMs }`, oldest
first) in memory and serves them as a push-mode **external** resource — its
truth is process memory, which the change-feed cannot observe, so it keeps a
hand `notify()`. The bound is part of the contract: `QueryDeadlinesSchema`
refuses a longer list, which makes the resource a schema-bounded scalar under
the bounded working-set rule. It resets when the backend restarts; the durable
record is the report.

On a hit the handler pushes the ring **before** it starts the report write. The
row must turn even when the report write is the query that cannot reach the
database.

The push rides the same live-state flush that a lost query can freeze. That is
safe: the deadline is what unfreezes the flush, and the hit's notify is queued
right behind it. The "stalled right now" case belongs to the Connection row
(Part 3 of the plan), not here.

**Accepted feedback loop.** If the database itself stops answering, the report
write for one lost query can itself be lost 60 s later and file another. That is
at most one write per deadline per chain, deduped onto the same row, and it
describes a genuinely broken database — so it is left alone rather than
special-cased.

## The Database row

`HealthReport.Row({ kind: "status", id: "database", order: 20 })`, right after
Connection (10). States:

- resource not loaded yet → `unknown` (pulsing, "Checking…"); failed to load →
  `unknown` "Couldn't load the lost-query history". Never `ok` before the data
  is read.
- a hit in the last 10 min → `attention`: "2 database queries lost in the last
  10 min — last at 12:01" (singular: "1 database query lost in the last 10 min —
  at 12:01").
- otherwise → `ok`: "No lost queries in the last 10 min".

Time moves the verdict by itself, so the hook keeps `now` as state and schedules
**one** `setTimeout` to the next instant the verdict changes — the moment the
oldest in-window hit turns 10 minutes old — re-arming after each step until
nothing is left to expire. No interval, no polling. The timer never steps `now`
short of the instant it waited for, or a verdict left unchanged would leave the
effect with no timer to fire again.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Query-deadline presence: the health report's Database row (attention while a database query was lost in the last 10 minutes, read from the db-query-deadlines push resource) and the one-line Debug → Reports summaries for the db-query-deadline and db-abandon-cap kinds. Query-deadline audit: registers a handler on the database plugin's query-deadline seam and turns each announcement into a report — db-query-deadline (error, one row per query label) when a query got no answer before its deadline and its connection was abandoned, db-abandon-cap (error, one rolling row) when the abandoned connections exceed the cap — and keeps the last 20 hits in memory as the db-query-deadlines push resource behind the health report's Database row.
- Web:
  - Contributes:
    - `Reports.KindView` → `QueryDeadlineSummary`
    - `Reports.KindView` → `AbandonCapSummary`
    - `HealthReport.Row` "Database"
  - Uses:
    - `primitives/css/badge.Badge`
    - `primitives/css/inline.Inline`
    - `primitives/live-state.useResource`
    - `reports.Reports`
    - `shell/health-report.HealthReport`
- Server:
  - Contributes:
    - `report-kind` "db-query-deadline"
    - `report-kind` "db-abandon-cap"
    - `resource.declare` "db-query-deadlines"
  - Uses:
    - `database.queryDeadlineSink`
    - `database/pgbouncer.PGBOUNCER_LOG_FILE`
    - `reports.recordReport`
    - `reports.ReportKind`
    - `reports.ReportRow`
  - Exports (values):
    - `abandonCapKind`
    - `queryDeadlineKind`
  - Resources: `db-query-deadlines` (push)
- Core:
  - Uses: `primitives/live-state.resourceDescriptor`
  - Exports (types):
    - `DbAbandonCapPayload`
    - `DbQueryDeadlinePayload`
    - `QueryDeadlineHit`
    - `QueryDeadlines`
  - Exports (values):
    - `DB_ABANDON_CAP_KIND`
    - `DB_QUERY_DEADLINE_KIND`
    - `DbAbandonCapPayloadSchema`
    - `DbQueryDeadlinePayloadSchema`
    - `dbQueryDeadlinesResource`
    - `QUERY_DEADLINE_RING_CAPACITY`
    - `QueryDeadlineHitSchema`
    - `QueryDeadlinesSchema`

<!-- AUTOGENERATED:END -->
