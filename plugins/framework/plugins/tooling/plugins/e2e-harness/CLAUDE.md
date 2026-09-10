# e2e-harness

## The target URL, and who chose the path

One flag, `--url` (`--base` / `--origin` are aliases), carrying one URL that
`target.ts` splits: the origin says which deploy, the path says which screen.
No script can obtain the bare origin — there are only two spellings, and the
difference is *who chose the path*:

- `pathUrl("/pages")` — the page THIS SCRIPT drives. Nearly every script. The
  root is `pathUrl("/")`.
- `pageUrl("/agents")` — the page THE CALLER named, falling back to that
  default. Only for tools whose job is "open the page I name": `screenshot.ts`,
  `perf.ts`, `render-profile.ts`, `live-state-churn.ts`, `adaptive-bar-*`.

So pass a page to a script that drives its own and the run FAILS at teardown,
naming the path you gave — it would otherwise pass, having tested a screen you
did not ask for. And a helper never takes a `base` parameter: `openBlankPage`
and `support/runs.ts` resolve their own target.

## The default target is READ from the registry, never guessed from a name

Pass no target flag and the script drives the deploy **this checkout
published** — `resolveCheckoutDeploy(REPO_ROOT)` reads every
`~/.singularity/worktrees/<ns>/spec.json` and keeps the namespaces whose
`server` path is this checkout's backend. Nothing is derived from a directory
name, and no environment variable has any spelling in this runtime.

That is not fastidiousness. The default used to be
`$SINGULARITY_WORKTREE ?? basename(REPO_ROOT)`, and `SINGULARITY_WORKTREE`
answers a question about a different process: the gateway sets it on the
backends it spawns, an agent pane inherits it through the tmux server, so from
inside any worktree it said `singularity`. Argument-less runs drove MAIN's app
and printed `ALL CHECKS PASSED` — and, since `withBrowser` opens by POSTing the
config repair to the resolved origin, reverted the user's live config documents
there before doing anything else. A name is only ever a guess about what
somebody else registered; the registry is the record the build itself wrote.

So the answers a name could not give are the ones you now get, each as a
`usage()` refusal (exit 2, before chromium launches and before the first
request):

- **This checkout has never been built** → `registered : (none)`, and run
  `./singularity build`. A basename would have handed back a live, plausible,
  entirely unrelated host.
- **This checkout published only a composition** → the refusal LISTS what is
  registered and points at `--composition sonata`. A composition build
  publishes `sonata.att-x`, whose namespace shares no label with the checkout,
  so no basename could have named it even in principle.
- **`--composition x` names one this checkout did not publish** → same shape,
  listing the ones it did.

`--composition <id>` is the only way to name a composition deploy. Passing it
alongside `--url` / `--base` / `--origin` is a usage error rather than a silent
drop: both flags answer "which deploy", so honouring one would run against the
deploy you explicitly did not name.

Every run prints the deploy it resolved, from inside `target()`'s one memoized
resolution rather than from a call site — 134 of the 165 scripts never bind
`pathUrl` at module top level and so printed nothing identifying their target,
which is why a fleet of green runs against main left no trace in any transcript:

```
target: http://att-….localhost:9000  (this checkout's singularity deploy, build-…-kb3y1y, built 4m ago)
```

`targetNamespace()` is for a script that must read or assert on a per-namespace
file on disk — a config document, a log, an artifact. It hands back an
IDENTITY, not a way back to an origin: rebuilding a URL from it with
`namespaceUrl` would ignore `--url` and point the script at the gateway
instead. Use `pathUrl` for anything the app answers.

`e2e-harness:target-not-env-derived` keeps the class out — any
`process.env.SINGULARITY_*` under `*/e2e/*.ts` fails the check. The prefix, not
the one variable: `$SINGULARITY_E2E_BASE` had the same shape (an inherited
channel that silently outranks the derivation, which nothing in the repo ever
set) and was deleted with it, so a second env-shaped target has to be
unspellable rather than merely absent today.

## A script that goes green without exercising the app is worse than no script

It gets cited as evidence. Three mechanisms here exist only to make that outcome
hard to reach.

**`report()` fails the run on unhandled rejections.** `finish()` ends with an
explicit `process.exit(0)`, which overrides the exit code the runtime would have
set on its own — so anything that threw outside the script's own `await` chain (a
route handler, a listener, a detached promise in a helper) used to print to stderr
and still be followed by `ALL CHECKS PASSED`. Those are now FAIL lines.
`uncaughtException` is deliberately NOT intercepted: a listener there would keep
the process alive past a fatal error, and an uncaught throw already fails loudly.
Limit: a rejection raised after the script's last `await` can still land after
`finish()` has exited.

**`stallRoute()` is the only sanctioned way to hold a request.** Optimistic-render
scripts stall a write endpoint and assert the UI updated well inside the stall —
latency alone is a weak assertion, since a localhost round-trip can beat a slow
poll. The hand-rolled version of that (route, sleep, then `unroute` when done) is
silently broken: `unroute` does not wait for a running handler, so removing the
last one continues the paused request immediately — the stall ends early, and the
sleeping handler's `route.continue()` throws `Route is already handled!`. The
primitive ends its stall on a signal instead of a teardown; the `no-unroute` lint
rule keeps the broken shape from coming back.

**`assertDeployIdentity()` proves the app answering the target is the build this
checkout made.** Resolving the right namespace is not the same as reaching the
right build: point at a deploy nobody rebuilt and every assertion below is made
against code this checkout did not produce. Two independently written records
settle it — `build-status.json`, written at the namespace directory's root by
the build that took the lock, and `.build-id`, written INSIDE the dist that
build published and served over HTTP by the gateway. Reading the local dist
instead would be a tautology, since `spec.web` is that same directory. The
compare is exact and the token must be whitespace-free, because the gateway
answers an unknown path with the SPA at HTTP 200, so `res.ok` is not evidence of
a hit.

`withBrowser` awaits it as its FIRST statement, above the config repair, so a
refusal lands before the first request rather than before the first assertion;
`agentFetch` awaits it too, which covers the scripts that never open a browser.
A `--url` skips it entirely — that arm carries no build of ours to compare
against, by construction — and only an `ok` receipt can refuse. `running`,
`interrupted`, `failed`, `superseded` and "no receipt" warn on stderr and
proceed: main auto-builds on every `refs/heads/main` advance and an interrupted
build is routine, so refusing on those would block every script in a checkout
over a dist that is almost certainly still the previous, complete, correct one.

Limit: it proves the served DIST, not the backend. A `--no-restart` build
writes an `ok` receipt with a new dist and leaves the previous backend running,
so a run can still be green against a new frontend talking to old server code.
Nothing here can see that — the receipt records one build id for both halves.

## A run puts the user's config back

A DataView writes its per-instance sort / filter / groupBy straight back through
config_v2 into the user's DURABLE config layer. So a script that clicks "Group by
Kind" to verify grouping leaves the surface grouped for the user — and poisons
its own next run's baseline (a "0 expanded elements" baseline became 44; the
assertion saw 44 → 44 and failed, looking exactly like a product bug).

`withBrowser` now reverts that automatically, so **do not hand-write a teardown
that puts a control back**. The server records the pre-write bytes of every
config document a request carrying the agent-origin header overwrites, and the
harness restores them:

- **at the START of every run**, before chromium launches — repairing a previous
  run killed by Ctrl-C, SIGKILL or a Playwright timeout, which is the half no
  teardown can provide;
- **at the END**, after `browser.close()` and after draining in-flight writes.
  That order is load-bearing: the write-back is a 400 ms trailing debounce living
  in a `setTimeout` inside the page, so closing first bounds what can still
  arrive.

Not covered, by construction: **secret (provider-backed) config fields**, which
never touch the JSONC layer; and a script's own **Node-side `fetch`**, which the
browser context's headers cannot reach — use `agentFetch` for those
(`agent-origin-safety/no-unmarked-app-fetch` enforces it).

**Do not run two e2e scripts concurrently.** Revert-all is what lets a run repair
one it did not launch; the price is that one script's end-revert would restore
another's in-flight writes.

## `finish()` is the teardown chokepoint, so `await` it

`report().finish()` ends in `process.exit()`, which skips `finally` — and most
scripts here call `finish()` INSIDE the `withBrowser` callback. So teardown
registers via `onBeforeFinish` and `finish()` drains it; that is why `finish()`
returns a promise and why `no-floating-promises` requires `await r.finish()`.
Before this, `await browser.close()` in `withBrowser`'s `finally` was silently
skipped for those scripts, leaking a Chromium process per run.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Shared Playwright harness for the per-plugin e2e/ scripts: argv parsing, worktree-derived target URL, browser/session lifecycle, error capture, pass/fail reporting, screenshots. Also owns the chromium install-time provisioning and the two generic tools (screenshot, perf).
- Core:
  - Uses: `framework/tooling/guards.MODULE_EXTENSION`
  - Exports (values): `isE2eScriptPath`
- Cross-plugin:
  - Imported by:
    - `active-data/page-link`
    - `active-data/prototype`
    - `apps-core/layout`
    - `apps-core/surface`
    - `apps-core/tabs`
    - `apps/agent-manager/pages-nav`
    - `apps/deploy/deploy-history/investigate-failure`
    - `apps/deploy/local-serve`
    - `apps/deploy/remote-deploy`
    - `apps/events/event-list`
    - `apps/events/sources`
    - `apps/events/sources/source-detail/runs`
    - `apps/mail/threads`
    - `apps/pages/history`
    - `apps/pages/page-outline`
    - `apps/pages/page-tree`
    - `apps/pages/starred`
    - `apps/prototypes/gallery`
    - `apps/prototypes/present`
    - `apps/prototypes/thumbnails`
    - `apps/sonata/library`
    - `apps/sonata/look`
    - `apps/sonata/pitch-layout`
    - `apps/sonata/view-options`
    - `build`
    - `code-explorer`
    - `config_v2/settings`
    - `config_v2/settings/conflict-agent`
    - `conversations/conversation-category`
    - `conversations/conversation-ui/row`
    - `conversations/conversation-view/jsonl-viewer`
    - `conversations/conversation-view/jsonl-viewer/investigate-event`
    - `conversations/conversation-view/jsonl-viewer/outline`
    - `conversations/conversation-view/jsonl-viewer/tool-call/page-tools`
    - `conversations/conversation-view/jsonl-viewer/transcript-stats`
    - `conversations/conversation-view/prompt-templates`
    - `conversations/conversations-view/data-view/queue`
    - `database/admin`
    - `debug/live-state-churn/emit`
    - `debug/render-profiler`
    - `improve/element-picker`
    - `infra/events-test`
    - `page/annotations`
    - `page/annotations/agent-access`
    - `page/annotations/human-notes`
    - `page/annotations/todo/task-link`
    - `page/callout`
    - `page/code-block`
    - `page/container`
    - `page/divider`
    - `page/editor`
    - `page/editor-collab`
    - `page/image`
    - `page/inline-date`
    - `page/page-reference`
    - `page/place`
    - `page/prompt/block`
    - `page/quote`
    - `page/url-paste`
    - `primitives/adaptive-bar`
    - `primitives/css/control-panel`
    - `primitives/css/grow-relay`
    - `primitives/css/radio-group`
    - `primitives/css/space-ramp`
    - `primitives/css/ui-kit`
    - `primitives/data-view`
    - `primitives/data-view/tree`
    - `primitives/data-view/view-core`
    - `primitives/date-picker`
    - `primitives/dom/copy-source-text`
    - `primitives/dom/overscroll-hint`
    - `primitives/networking`
    - `primitives/pane`
    - `primitives/row-actions`
    - `primitives/text-editor/caret-trigger`
    - `primitives/tree`
    - `release`
    - `reorder`
    - `reorder/node-types`
    - `reports`
    - `shell/toast`
    - `tasks/auto-start`
    - `tasks/launch-options`
    - `ui/theme-toggle`

<!-- AUTOGENERATED:END -->
