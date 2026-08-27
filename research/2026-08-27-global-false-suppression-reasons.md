# A false reason on a live lint suppression is a review concern, not a detectable one

**Date:** 2026-08-27
**Category:** global (lint)
**Status:** decided — three sites fixed, no new mechanism added

## Context

`reportUnusedDisableDirectives: "error"` catches a disable directive that suppresses nothing. It says nothing about a directive that still suppresses something while the reason written beside it is false.

Three such directives existed, all reading `-- runtime guard, no noUncheckedIndexedAccess`. The repo sets `noUncheckedIndexedAccess: true` (`tsconfig.base.json:12`), so the claim was wrong. 128 copies of the same sentence had already been deleted for going dead; these survived because they still fired — and they sat where the code is subtle enough that a reader would lean on the comment.

This doc records what they turned out to be, and why no detector was built.

## What the three sites actually were

Removing each directive and running eslint reported the same thing at all three: *"Unnecessary optional chain on a non-nullish value."*

```ts
if (!event?.taskId || !event?.conversationId) return;
//                        ^^ reported
```

Reaching the second test means the first was falsy, so `event?.taskId` was truthy, so `event` exists. The second `?.` can never do anything. `turn-summary/job.ts` had the same shape one guard later: `if (!conversationId) return;` narrows `event`, making the two `event?.` reads below it dead.

**So the reason was not merely false — the suppression was never earned.** The fix was to delete one character of code at each site, not to reword a comment. An honest comment would have read "this guard does nothing."

Fixed in this change:

- `plugins/improve/server/internal/apply-group-job.ts`
- `plugins/conversations/plugins/conversation-view/plugins/turn-summary/server/internal/job.ts` (×2)

Each keeps a short plain comment explaining the narrowing, so the next reader does not re-add the chain.

## Why no detector was built

Two measurements, both discouraging.

**1. The one crisp detector has zero forward yield.** Reason prose that names a TypeScript compiler flag is machine-checkable: flag names are a closed set TypeScript publishes, they never appear in prose by accident, and the effective tsconfig for any file is knowable. Scanning the whole repo for that pattern returned **exactly three hits — the three fixed here.** After this change its expected yield is zero. It would be a standing check that can never fire again.

Beyond flag claims, reason prose is site-specific narrative ("mt-2 offsets the body from the ToolCallCard header"). Whether that is true is not decidable by a machine, and a detector that guesses produces noise.

**2. The sample size is one, not 131.** All three lines come from a single commit — `20281d1e9`, *"overhaul ESLint rules … clean up 302 warnings"*, an agent session (`conv-1778510006-3ddl`). One agent, one paste, 131 copies. That is one mistake, not 131, so the recurrence gate for building a permanent guardrail has not been passed.

The generating process — an agent told to clear N warnings — *is* structural in this repo and will recur. But the mechanism that caught 128 of the 131 was `reportUnusedDisableDirectives`, which already exists; and a stricter reason format would not have stopped a bulk pass, which picks a token as readily as it pastes a sentence.

## Considered and rejected

A closed justification vocabulary for `@typescript-eslint/no-unnecessary-condition` — every suppression required to open its reason with a registered token (`undecoded-boundary`, `upstream-types`, `forward-compat`, `types-unsound`), enforced by a contributed lint rule, with no token meaning "the guard is redundant" so a dead guard has nowhere to hide.

Rejected as disproportionate at n=1. Its real strength is not preventing false prose — a mistagged site satisfies it just as well — but making the `undecoded-boundary` population greppable as one set. **Revisit it if and when someone commits to working that backlog**, at which point it earns its keep as tracking rather than as a guardrail.

## The backlog it surfaced

Suppressing `no-unnecessary-condition` asserts something strong: *the type says this value cannot be missing, and at runtime it can.* Reading all 39 suppressions in the repo, they group into four claims about how a type can be wrong:

| Claim | Sites | Drainable? |
|---|---|---|
| The value crossed a seam with no decoder — on-disk JSON, an `as`-cast from `unknown`, an external API response, a queue payload, a legacy DB row. The type was asserted, not proven. | ~26 | **Yes** — a decoder at the seam (`ZodParser`, `queryRows`, `parsedJson`) makes the guard unnecessary |
| A third-party package's types overstate its runtime (`hasNextPage` before first fetch, `SpawnSyncReturns`). | 5 | No — we do not own the package |
| The union is open by design; the guard covers members not added yet. | 3 | No — legitimate |
| TypeScript's model cannot see it (`typeof null === "object"`, mutation between statements, a value produced under a different runtime). | 4 | No — legitimate |

The first row is the real find: **~26 places where a value enters the system undecoded**, concentrated in `conversations/plugins/transcript-watcher/server/internal/parse-jsonl.ts` (7), plus `conversations/server/internal/claude-transcript.ts`, `infra/plugins/corpus-index/…/corpus-index.ts`, `infra/plugins/secrets/central/internal/store.ts`, `auth/central/internal/{token-store,oauth-flow}.ts`, `stats/plugins/cost/server/internal/usage-index.ts`, and the two `as`-cast tool views under `jsonl-viewer`.

That is the same architectural program as `research/2026-07-08-global-absorbable-failure-guardrail.md` and the "parsed at the boundary, not asserted" work in `database/plugins/sql-rows`. Recorded here rather than acted on.

## Known, not addressed

80 disable directives repo-wide carry no reason at all, mostly `promise-safety/no-bare-catch`. An unexplained suppression is worse than a falsely explained one. Separate change, 80 judgement calls.
