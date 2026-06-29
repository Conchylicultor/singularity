---
name: perfs-investigation
description: >
  Methodology for performance root-cause investigations. Read BEFORE any perf
  investigation, profiling pass, or perf fix. Enforces rate×cost decomposition, tracing
  to the origin (not the hotspot), and the stopping gates that decide when you have
  actually found the root.
---

# Performance investigation

The cardinal sin in perf work is **fixing the wrong path** — landing on where time is
*spent* instead of on what makes the work *happen*. The hotspot is almost never the
cause; it is the place the cause shows up. This skill is the discipline that keeps you
climbing from the symptom to its origin. Work the phases in order; do not skip a gate.

## Mental model: every cost is `rate × cost-per-occurrence`

A profiler ranks operations by per-occurrence duration, which biases you toward making the
expensive op *faster*. But **the biggest number in a profile is usually a downstream
amplifier of a smaller upstream driver. Amplitude is not causality.** For any hot op there
are two questions — *how expensive is one occurrence?* and *why does it occur so often?* —
and the profiler hides the second. The second is usually the root.

Each axis has a lazy escape that *looks* like a fix but only hides the cost:

- **Rate axis:** make the op cheaper per call instead of asking why it runs so often.
- **Cost axis:** **cache / memoize the slow op instead of asking why one call is slow.**

A cache does not make the computation fast — it makes it *not run sometimes*. The slow work
still happens cold: first hit, after eviction, on every key it hasn't seen, after any input
changes. You have relocated the cost and added invalidation risk, not removed it. **Caching
is the cost-axis twin of "do it more cheaply" — it is containment, never a cure, until you
have established the work is necessary, correct, and irreducibly expensive.** First ask: does
this need to run at all? Is it doing redundant work, the wrong algorithm, an N+1, a query
missing an index? Only cache an op you have *already proven* must be both this frequent and
this slow.

## Phase 0 — Re-validate, never inherit (gate before any new work)

A prior "confirmed root cause" — yours or someone else's — is a hypothesis, not a fact.

1. Re-measure on the SAME target with fresh instrumentation (every measurement tool you
   have, not just one).
2. Confirm any prior fix actually landed and moved the number it claimed — check the
   system/data, not the commit message.
3. If a previously-"confirmed" cause no longer dominates a fresh window, it was a symptom —
   say so explicitly and re-open. Inheriting a conclusion is how the wrong path persists.

## Phase 1 — Quantify: work vs wait, steady vs outlier

1. Aggregate by total contribution (rate × cost), not by per-occurrence duration alone.
2. Split every hot entry into **work** (active CPU/IO it does) and **wait** (time blocked on
   something else). A high duration that is mostly *wait* is head-of-line blocking — that
   entry is a **victim, not the cause**. Find the dominant wait *layer* before theorizing.
3. Separate steady state from the one-off: compare the max against avg × count. A lone
   multi-second spike over a tiny average is an *amplified event*, not a slow op — your job
   is to find what amplified it, not to optimize the op.

## Phase 2 — Trace to the origin (the heart of the method)

For the dominant cost, walk the causal chain UP, one hop at a time:

```
delivery ← persist/write ← recompute ← invalidation ← the event/trigger that fired it
        ← the caller that emitted that event ← why that caller ran at that rate ← …
```

At each hop, re-decompose into rate × cost and apply the stopping gates below. A
**no-op / redundant / unchanged signal** — an empty diff, a write that changed no rows, a
same-value update, an idempotent insert that hit a conflict, a recompute that produced no
change — is a flashing arrow upstream: **the fix for wasted work is to not do it, never to
do it more cheaply.**

### Stopping gates — you cannot *prove* there is no level above; stop by criteria, not certainty

Answer all four, in order, at the candidate node:

1. **Sufficiency (quantitative).** Does this node's *rate* reproduce the symptom's rate? If
   the arithmetic doesn't close, a contributor is missing — keep measuring. Passing this
   proves you found *a sufficient* cause — **NOT** the deepest. It is the minimum bar, and
   the one most often skipped.
2. **Legitimacy (the real stop).** Ask: *should this event happen, at this rate?* Stop ONLY
   when the answer is yes — behavior that is *supposed* to occur this often (a user action, a
   genuine data change). Anything illegitimate (work that changed nothing, a recompute that
   produced no change, a periodic poll doing nothing) means the root is still above — keep
   climbing.
3. **Counterfactual.** If I fix only this node, does the illegitimate behavior *disappear*,
   or does it keep happening but cheaper? "Cheaper" is **containment**, not a cure — and
   **caching/memoizing is the most common disguise for "cheaper"**: the slow op still runs,
   you have only skipped some calls. State which you are buying.
4. **Requirement boundary.** Stop when the next level up is a genuine product requirement, or
   when fixing higher costs more than it saves. Name the requirement explicitly.

> The shape of the trap: a long stall traces to one expensive write (gate 1 passes →
> "found it"). But that write was a no-op (gate 2: illegitimate), caused by a trigger firing
> on a statement that changed nothing (gate 2: illegitimate), caused by a periodic poll
> re-doing settled work (gate 2: illegitimate). The first "root" was three hops too low —
> because only gate 1 was applied and gate 2 was skipped.

### Fixes live at multiple altitudes — name each, don't crown one "the root"

- A **boundary invariant** makes a whole class structurally impossible for any caller (e.g.
  "an operation that changed nothing must never invalidate downstream state"; "no unbounded
  growth on this path"). Worth landing even when it is not the origin — but it is
  *containment* and does not absolve you from finding the origin.
- The **origin fix** removes the illegitimate behavior itself (stop the poll, fix the
  misclassification, bound the source).
- Prefer **both**: the invariant prevents the whole class (incl. future callers); the origin
  fix cures the present one.

## Phase 3 — Confirm beyond doubt, then write the fix

Only once the stopping gates resolve, converge **three independent lines of evidence**: the
live profile, the system/data facts (query the actual state, sizes, counts), and the actual
code path. If they disagree, you have not found it. Then — and only then — write the fix.
Record every discarded hypothesis **with the gate number that killed it**, so the next pass
re-validates against data instead of re-deriving.

## Phase 4 — Counterfactual exit test

Before declaring done, replay the original symptom against the proposed fix:

> "If the same load happened again, does this fix make the wasted work **not happen**
> (origin) or merely **not hurt** (containment)? Is that the altitude I intended?"

If you cannot say which altitude you bought, Phase 2 is unfinished.

## Footguns are structural debt — surface, don't memorize

If the root cause was *possible* only because of a missing invariant (a trigger that fires on
no-ops, an unbounded path, an unconditional write), the durable fix is that invariant — a
check, a lint rule, a type, a guard at the boundary — reported so it is enforced, **not** a
personal memory describing the trap. A memory protects one agent; the invariant protects
everyone.
