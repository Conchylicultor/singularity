# Live resources — answering the audit's open questions (§10)

## Context

The agent page "Live resources — audit and target model"
(`block-fbee0e5f-da91-4dca-a0fe-53c02cc2e138`, under the Resources page
`block-f64cfc08-…`) ends with §10 "Not yet researched", mirroring the author's
todo card on the parent page:

1. What is still legacy?
2. Which duplicated systems exist?
3. How integrated is live-state with the unified slow-op profiling?

The target model (§9) depends on the answers. This is a **research-only**
task: no code changes. The deliverable is a rewritten §10 on the agent page.

## Method (done, read-only)

Three parallel code sweeps over `plugins/`, then spot-checks of the claims
the findings lean on (`server-core/core/resources.ts:219-232`,
`change-feed/server/internal/*`, `turn-summary/shared/schemas.ts`,
`allow-monitor-chip.tsx:14`, `sonata/playback-history` loader, the
`scopedMembership: true` sites, `resource-runtime/core/runtime.ts:641`).

Inventory source: the `resource.declare` contribution list (106 resources),
**not** `docs/plugins-details.md`'s "Resources:" facet — that facet silently
drops any resource registered with `key: xResource.key` (14 missing: all 8
Sonata resources, `pages`, `page-links`, `page-blocks`, `page-backlinks`,
`data-view-custom-values`, `data-view-row-order`). That blind spot is itself a
finding.

Commit `ed6038469` (today) already landed audit findings B and C
(`mapResource` + `ResourceResult<T | null>`, lint watching the bounded hooks).
§8's B/C entries get a one-line "fixed in ed6038469" note; nothing else in
the inventory changes.

## Draft findings (what will be written)

### 10.1 Legacy inventory — 26 resources

Totals: 6 keyed-unbounded, 16 whole-table push arrays/maps, 4 on the
`scopedMembership` alias. 11 already on window/point. ~53 are
unbounded-*shaped* but fine (scoped by a parent-id param, LIMIT-bounded,
schema-capped, in-memory, or small human-authored config). ~10 are revision
ticks.

Grouped by what blocks the move:

- **Mechanical point ports (no blocker)** — `turn-summaries` (bootCritical,
  whole map resent on every assistant turn, no retention — the worst one),
  `conversation-summaries`, `task-efforts`, `task-preprompts`. Same shape as
  the already-migrated `conversation-progress`.
- **Per-song scoping (Sonata, 8)** — `sonata-playback-history` grows on every
  play with no cap or retention and resends the whole history; six per-feature
  override tables (`track-view`, `chord-mode`, `key-auto-detect`, `rhythm`,
  `song-midi`, `transpose`) resend every song's overrides on any edit and
  should take `{songId}`; `sonata-songs` needs a window for library browse.
  Not named in the 2026-07-18 plan (its ranking only measured boot-loaded
  values); covered only by its Phase 3 catch-all.
- **Window with a LIMIT** — `reports` (table is retention-swept, but the query
  has no LIMIT).
- **Tree cluster, blocked on a windowed-tree design** — `tasks`, `attempts`,
  `conversations-active`, `conversations-system` (the `scopedMembership`
  cascade roots), plus co-bounded `task-categories`, `prompt-task-origins`.
  `agent-launches` belongs here but is **not named anywhere** in the contract
  doc.
- **Whole-graph consumers** — `pages` (17 readers build the sidebar tree,
  `[[` picker, breadcrumbs), `page-links`. Same blocker as the tree cluster.
- **Small by domain, legacy mechanism only** — `browser-bookmarks`,
  `plugin-health-reviews`, `deploy.server-health` (with `deploy.servers`).
- Watch list (fine today): `agents` (bootCritical push array of a
  human-sized roster), `claude-cli-calls` (resends a 1000-row window per call).

### 10.2 Duplicated systems

Known list, verified:

| Pair | Status | Blocks removal |
|---|---|---|
| `scopedMembership` vs `membership` | Inverted: 4 hand-written `scopedMembership` sites, **0** hand-written `membership` (only compiler output) | Nothing planned; it is the ergonomic unbounded form. Target model (§9) folds both into "bounded membership". |
| Push arrays vs keyed rows | Concrete case: `pushes` (0 web readers) kept alive only as a change-feed anchor for `attempts`' cascade edge | `rel()` can only anchor on a resource, not a raw table — runtime gap |
| `keyedResourceDescriptor` vs `queryResourceDescriptor` | 8 vs 8 sites; one runtime underneath (the query form wraps the keyed one) | Compiler has no joins / foreign-column keying |
| Raw window/point factories | 0 external callers; only `query-resource` wraps them | Nothing — un-export |
| Hydration paths | Boot snapshot (canonical) + config's own boot task + `hydrateResource`/`hydrateEndpoint` names; a 4th "boot snapshot" is the server L2 restore | Boot snapshot hydrates one param tuple per key; config needs N |
| `useConfig` vs `useConfigResult` | 57 vs 7 files; clean delegation | Deliberate two-tier API; the 57 need an audit for "defaults shown as data" |

New:

- **A second live-collection mechanism: revision tick + paged endpoint.** 8
  `{ rev }` resources (conversations, runs, release runs, deploy runs, mail
  threads, events, event runs, latency ledger) drive ~10 DataView surfaces
  that refetch their loaded page over HTTP (`dataSource: { changeTick,
  fetchPage }`). Has filters-as-data and keyset paging; lacks row deltas and
  boot hydration. In scope for the §9 redesign.

- **`mode` default mismatch** (already §5/F) also causes the scope check and
  runtime to read a missing `mode` differently — keep, cross-reference.
- **Three backoff tables in `networking`** (`fetch-with-retry`,
  `shared-websocket`, `reconnecting-event-source`); the SSE copy lacks the
  jitter WS says is needed. Pure refactor.
- **Polling instead of a live resource** — `allow-monitor-chip.tsx` polls an
  endpoint every 3 s for a file check; no check catches "`useEndpoint` +
  `refetchInterval` for app data". 105 `useEndpoint` sites are unaudited for
  shadowing a resource.
- **Two measurement systems for delivery latency** (see 10.3):
  slow-ops keeps only above-threshold samples, `latency-ledger` keeps all.
- **The docs resource facet** disagrees with `resource.declare` (14 missing):
  two inventories that should be one.

Checked and **not** duplicated (closes these out): `matchResource`/
`ResourceView`, `usePointResource(s)`, `combineResources`, optimistic writes
(one path; `ackChannel` is its substrate), the four WS channels (one transport),
central vs worktree runtime (already unified), factory lists (already unified
by `resource-vocabulary`), window/point codecs, L2 vs boot snapshot (a
fallback chain), the scope-policy type + backstop check (deliberate).

### 10.3 Slow-op profiling coverage

| Phase | In slow-ops? | Gap |
|---|---|---|
| Loader run | Yes — `loader` span, label = key (`server-core/core/resources.ts:219`); DB queries and pool/heavy-read waits nest under it | Params not in the label: all tuples of a key merge into one row |
| Flush cycle | Yes — `flush` span `flushNotifies` (:228) with loads nested | Mutex age (`flushOpenMs`) rides WS pings to the health row, separately; stuck flushes go through `debug/stuck-spans` (open spans), by design |
| Change-feed NOTIFY → routing | **No** — zero instrumentation in `change-feed` | `changedAt` only feeds `latency-ledger` end-to-end |
| Delivery | Latency yes — `push` span `deliver:<key>` (:231) | Fan-out count dropped; frame bytes measured nowhere |
| Invalidate HTTP refetch | **No** — `GET /api/resources/:key` is a raw route, not `implement()` | Its loader appears with `parent: null`; 304s record nothing |
| Window/point membership queries | Only as generic `db` spans under the loader | No label separating refill/ids queries from the value query |
| L2 persist / boot snapshot | Persist: generic `db` span. Boot snapshot: `http` + nested loaders | Boot snapshot's own `persistedReadMs`/`workMs` breakdown goes to the client payload only |
| Client time-to-first-data | Yes — `element` ops from `useResource` | — |
| Client change → settle | **No** — `latency-ledger` `update-e2e` only | Two systems, different retention rules |
| Render cost | No — render-profiler / render-loop | Separate by design |
| Optimistic write → confirm | **Nothing measures it** | Only the sync-status cloud |

Verdict: the compute path (loader → flush → deliver) is integrated with
real caller and wait attribution. The gaps are the plumbing around it:
change-feed routing, the HTTP fallback endpoint, payload size and fan-out,
and the two end-to-end numbers users feel (change → settle, write → confirm).

## Writing to the page

1. `edit_page` on the audit page: replace the §10 block ("## 10. Not yet
   researched" + its three bullets) with "## 10. Legacy, duplication and
   profiling" containing 10.1–10.3 above, written in the page's plain style
   (short bullets, one idea each, tables only where they are already used).
   Also append "(fixed in `ed6038469`)" to §8's B and C.
2. `read_page` again to confirm it rendered, and check the todo card on the
   parent page is untouched (it is the author's; we don't tick it).
3. Offer, **not do**: `add_task` for the no-blocker items (`turn-summaries`
   point port, Sonata per-song scoping, un-export raw factories, backoff
   helper, allow-monitor → external resource, resources-facet blind spot,
   change-feed + HTTP fallback spans).

## Verification

- Every file:line in the page text was re-read in this worktree
  (`ed6038469` base) before writing.
- `read_page` after the edit shows §10 in place and §1–§9 unchanged.

## Outcome

Written to the audit page §10 (10.1–10.5) on 2026-09-23; §8 B/C marked fixed
by `ed6038469`. Four follow-up tasks filed; a nested next-steps status card
added to the Resources page.
