# Render-loop detector: aggregate subtree-cascade tier

## Problem

The render-loop detector (`plugins/reports/plugins/render-loop`) keys every
sliding-window counter **per leaf culprit signature** (DOM node + attribute) and
fires only when ONE signature sustains above its class threshold
(3 childList-rebuilds/s or 30 no-op/oscillating attr-writes/s) for 3s while
idle+visible+wasted.

This has a structural blind spot: a re-render **cascade spread thin across MANY
nodes** is invisible. No single leaf signature ever crosses threshold, so nothing
is filed — and not even a near-miss is logged.

Motivating case: the conversation transcript (jsonl-viewer assistant-text/markdown
subtree) re-renders the whole transcript ~3-4×/s while idle, producing ~300
attribute writes/s spread across many message nodes → ZERO render-loop signal,
while a concentrated loop on one node (VoiceInputButton @5/s childList) was caught.
The diffuse whole-subtree thrash is the *most expensive* class yet went undetected.

Secondary gaps surfaced by the same case:
1. Once a code block is made idempotent (no childList rebuild), the cascade leaves
   only attribute churn, which the per-leaf model under-counts (spread thin).
2. Gate-4 "wasted work" classifies broad reconciliation with *changing* values as a
   near-miss at most, never a report — so a genuine idle cascade that mutates real
   values is dismissed.

## Approach: a second, aggregate tier

Keep the existing **leaf tier** unchanged (it correctly catches concentrated
loops). Add an **aggregate tier** that sums mutations across a stable ancestor's
descendants against its own threshold, so a loop distributed across a subtree is
caught even when no individual leaf is hot.

### Aggregate root (the stable ancestor we roll up to)

Per mutation we already compute `culpritMeta`, which walks up to the stable
composition markers. Add an `aggregateRoot` field — the **coarse container**
identity, dropping all per-node variance (bounded path, source, owner):

- Prefer `pane:<paneId>` (the nearest `data-pane-id` host — the natural cascade
  boundary; a pane is a coherent unit and `data-pane-id` is a stable pane-*type*
  id set by the layout host).
- Else the nearest `data-plugin-id` marker's `pluginId@slotId` (so non-paned
  surfaces still get aggregate coverage at the plugin level).
- Else `undefined` → the mutation is not tracked in the aggregate tier (never
  aggregate at the bare document-body level — too coarse, would false-positive).

All transcript message nodes (regardless of which nested child plugin renders each
part) roll up to the one conversation **pane** key. That is exactly the cascade
unit, and it is robust to the per-message/per-part-type plugin/source variance that
fragments the leaf signature.

### Aggregate state & the pure window helper

Extract the window math into a pure, unit-tested helper
`web/internal/aggregate-thrash.ts` (an `AggregateWindow` class — no DOM), so the
breadth/rate logic is testable in isolation (`bun:test`, co-located
`aggregate-thrash.test.ts`). The detector holds one `AggregateWindow` per root plus
the gating/streak state, mirroring the leaf `evaluate`.

`AggregateWindow`:
- `record(leaf, t)` — push an aggregate event timestamp and a per-leaf timestamp;
  cap distinct tracked leaves at `AGG_MAX_TRACKED_LEAVES` (skip *new* leaf keys
  once full — existing keys keep updating; bounds memory).
- `rate(now)` — prune to `WINDOW_MS`, return events/sec.
- `recurringBreadth(now, minRepeat)` — prune, count distinct leaves hit
  ≥ `minRepeat` times in the window (the cascade signal: the SAME nodes re-touched,
  not a one-shot insert burst).
- `sampleLeaves(now, n)` — top-N leaf signatures by hit count (attribution).
- `lastEventAt` — for GC.

### Gates (aggregate fire)

1. **Sustained** — `rate ≥ AGG_PER_SEC` continuously for `SUSTAINED_MS` (reuse 3s).
2. **Idle** — reuse the shared `lastInteractionAt` (no input within `IDLE_MS`).
3. **Visible** — reuse `document.visibilityState`.
4. **Breadth (the wasted-work discriminator, replacing per-value no-op checks)** —
   `recurringBreadth(now, AGG_MIN_LEAF_REPEAT) ≥ AGG_MIN_LEAVES`.

Gate 4 is the key design decision and the fix for secondary gap #2: an idle subtree
re-mutating ≥`AGG_MIN_LEAVES` distinct nodes, each ≥`AGG_MIN_LEAF_REPEAT`× within
1s, sustained 3s, **is** wasted whole-subtree reconciliation — *whether or not the
written values change*. Breadth + recurrence + idle is what distinguishes a cascade
from legitimate sparse idle updates (a clock, one live counter). This also fixes
gap #1: the aggregate counts BOTH attribute and childList mutations across the
subtree, so attribute-only churn (after a code block is made idempotent) still sums.

Near-misses (gates 1-3 pass, breadth below threshold) are logged to the
`render-loop` clientLog channel (throttled per root via `NEAR_MISS_LOG_MS`) — so the
diffuse case now produces a signal even when it doesn't fire, closing the "not even
a near-miss" complaint.

### Disjointness from the leaf tier

The two tiers are naturally disjoint: a single hot leaf has breadth 1 → no aggregate
fire; a diffuse cascade has no leaf ≥ its class threshold → no leaf fire. If both
ever fire they carry different signatures (leaf sig vs aggregate root) and a
different `mutationClass` → distinct fingerprints / reports. The per-session
`firedGuards` set dedups each independently. No cross-tier coupling.

### New mutation class + payload

- Add `"subtree-cascade"` to the `mutationClass` enum (schema, `CLASS_LABEL`,
  fix-advice branch).
- Add optional/nullable payload fields (back-compat; leaf reports leave them null):
  `distinctLeaves?: number` (breadth at fire), `sampleLeaves?: string[]`
  (top leaf signatures for attribution).
- Fingerprint is unchanged: `signature(=aggregateRoot) | mutationClass | attrName`
  with `attrName=null` for cascades — rate/breadth excluded so repeats dedup.

### Constants (added to `RENDER_LOOP`)

- `AGG_PER_SEC = 60` — aggregate mutations/sec across the subtree (motivating case
  ~300/s; well above any sparse idle baseline; a single leaf maxes at the 30/s leaf
  threshold so 60 forces genuine breadth).
- `AGG_MIN_LEAVES = 5` — distinct recurring leaf signatures (separates diffuse from
  concentrated).
- `AGG_MIN_LEAF_REPEAT = 2` — a leaf must recur ≥2×/window to count (drops one-shot
  initial-render bursts; a re-render re-touches the same node).
- `AGG_MAX_TRACKED_LEAVES = 256` — memory cap on distinct tracked leaves per root.
- `AGG_SAMPLE_LEAVES = 6` — sample leaf signatures attached to the report.

## Files

- `core/render-loop-kind.ts` — add the 5 constants, the `"subtree-cascade"` enum
  member, and the `distinctLeaves` / `sampleLeaves` optional fields.
- `web/internal/aggregate-thrash.ts` (new) — pure `AggregateWindow`.
- `web/internal/aggregate-thrash.test.ts` (new) — `bun:test` for rate/breadth/cap.
- `web/internal/culprit-signature.ts` — add `aggregateRoot` to `CulpritMeta` + its
  computation.
- `web/internal/render-loop-detector.ts` — wire the aggregate tier (per-root
  `AggregateWindow`, `evaluateAggregate`, `fireAggregate`, GC, cleanup).
- `server/internal/render-loop-task.ts` — `subtree-cascade` label, fix advice, and
  render `distinctLeaves` + `sampleLeaves`.

## Caveats / tuning

- A legitimately live idle surface (a dashboard updating many cells) could in
  principle fire; mitigated by the high `AGG_PER_SEC`, the 3s sustain, and the
  warning/6h-rearm severity. The `render-loop` clientLog channel (firings +
  near-misses) is the calibration surface, matching the original rollout decision.
- Tier-disjointness is by construction, not enforced; acceptable since the two
  fingerprints differ and both are deduped warnings.
</content>
</invoke>
