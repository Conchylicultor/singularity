# Sweep `scopedMembership` onto remaining eligible keyed scans — audit + decision record

> Executes the M5 follow-up "Sweep `scopedMembership` onto the remaining
> SIMPLE-SELECT keyed resources once the conversation scans bake"
> (`research/2026-07-03-global-scoped-membership-m5.md`). Audit-first: the sweep
> turned out to be small and precise because the later bounded-working-set
> contract (`research/2026-07-18-global-bounded-working-set-resource-contract.md`)
> reshaped most of the population.

## What `scopedMembership` is the right fix for

`scopedMembership: true` opts a **non-windowed keyed scan** into row-level
membership scoping: an INSERT/DELETE/where-flip ships an incremental delta
(`orderOf` runs only when a row *enters*) instead of forcing a whole-list FULL
recompute. It still keeps an **O(collection) in-memory per-pk snapshot**, so it is
the correct *terminal* shape only for a **genuinely domain-bounded whole-collection
scan** whose consumers read the entire array (no per-key subscription). For an
**unbounded** collection the working set stays O(total), so the right fix is a
bounded `windowQueryResource` (`point` / `window`), not `scopedMembership`.

## Audit (2026-08-18)

13 real `queryResource(...)` call sites. Excluding the 2 already opted in
(`conversations-active`, `conversations-system`), the `tasks` tree, and
`build-history` (`limit` + `recompute:{full}` — a windowed read, ineligible),
9 candidates remained. Key finding: **zero** un-migrated
`recompute:{full, reason:"where-filtered membership"}` resources exist — the named
archetype `notifications` was solved by the bounded-working-set migration to
`windowQueryResource` (its `dismissed=false` where-flip is now a window membership
exit), and the only two mutable-`where` scans (`conversations-active/-system`) were
the M5 pilot itself. So the mutable-`where` half of the sweep is already complete.

### Per-candidate classification

| Resource | Shape | Verdict | Reason |
|---|---|---|---|
| `browser-bookmarks` | no-where, single-user list, pk `id` | **A — opt in** | Domain-bounded whole array; churns purely by INSERT/DELETE (star/unstar) |
| `plugin-health-reviews` | no-where, one row per (pluginId, axis), pk `id` | **A — opt in** | Bounded by plugin count, whole array; INSERT/DELETE (new/cleared review) forced FULL |
| `tasks-auto-start` | per-task 1:1 marker, per-row `.find()` | **B — point migration** | Same shape as the migrated `conversation-category` pilot; `point:{by: parentId}` |
| `pages-starred` | per-page 1:1 marker, per-row `.some()` | **B — point migration** | Per-parent marker keyed by unbounded `pageId`; dominant consumer is a per-row lookup |
| `task-categories` | per-task ext, whole-map DataView grouping | **C — deferred** | In-code deferral: rides the unbounded `tasks` tree migration; unbounded ⇒ `scopedMembership` wrong |
| `prompt-task-origins` | per-task ext (task-side) | **C — deferred** | Same in-code deferral, tied to the `tasks` tree |
| `deploy.server-health` | per-server ext, bounded | **C — deferred** | In-code deferral: co-bounded with `deploy.servers`, migrates together |
| `mail-thread-messages` | per-key parametrized `{threadId}` | **C — already bounded** | Bounded per key; `scopedMembership` would only shave INSERT churn within one open thread |
| `story-generated-units` | no-where, unbounded, identity pk `id` not `pageId` | **Outside A/B/C** | Unbounded ⇒ `scopedMembership` wrong; pk ≠ `pageId` ⇒ `point` can't express it. Needs a `{pageId, kind}` param (the mail-thread-messages shape) |

## Decisions

- **Do now (A):** add `scopedMembership: true` to `browser-bookmarks` and
  `plugin-health-reviews`. Both: base table, single-column pk `id`, immutable
  order columns (`createdAt` / `pluginId,axis`), whole-array consumers, bounded by
  domain. Wire shape unchanged, no client changes. This is the correct terminal
  shape for these two.
- **Do NOT bolt `scopedMembership` onto B/C-out candidates.** For the per-parent
  side tables (`tasks-auto-start`, `pages-starred`) and the unbounded
  `story-generated-units`, `scopedMembership` would build a half-measure on the
  legacy unbounded form the bounded-working-set contract is retiring. The correct
  fix is a `point`/param migration — filed as follow-ups there, not done here.
- **C-deferred** (`task-categories`, `prompt-task-origins`, `deploy.server-health`,
  `mail-thread-messages`) already carry explicit in-code deferral comments tied to a
  companion migration, or are already bounded per key. No change, no new task.
- **Doc fix:** the `query-resource` CLAUDE.md intro example used `notifications`
  (now a `windowQueryResource`) with a mutable `where` and no opt-out — self-
  contradictory against its own RULE. Replaced with the real `browser-bookmarks`
  form.

## Follow-ups filed

- Point-migrate `tasks-auto-start` and `pages-starred` to `windowQueryResource`
  `point:{by: parentId}` (bounded-working-set Phase 2; mirrors the
  `conversation-category` pilot; no blockers — no in-code deferral ties them to
  anything pending).
- Parametrize `story-generated-units` by `{pageId, kind}` (the
  `mail-thread-messages` per-key shape) so its scan stops loading the whole
  app-wide units table client-side per open page.
