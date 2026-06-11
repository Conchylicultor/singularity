# Singularity

Singularity is a self-evolving app for the agentic era. The goal is to have an app which can replace all others, customized for each individual user, at the boundary of an application and an operating system. The vision has a few steps:

- At first, the app itself is an Agent manager app whose goal is to fix todos faster than they are created. The app will be used to improve itself.

  The app is a nested todo list of tasks agents need to execute. Each agent executes in its own isolated `worktree` (including this current session) and deploys to `http://<worktree>.localhost:9000`. The UI allows seamless switching between namespaces to inspect agent work.

- The app evolves into a Notion-like WeChat: a single unified surface where agents compose user-tailored apps on the fly from plugin building blocks. Notion gives users composable blocks (databases, pages, views) to fit their workflow; Singularity does the same at the *app* level, with agents doing the composing. The agent manager becomes one such composition among many, sharing the same plugins and primitives.

- A plugin marketplace where users contribute and share building blocks. Each user gets a unique composition assembled by agents from marketplace plugins — not a one-size-fits-all tool, but a personal OS shaped to their workflow.

## Agent Workflow

Agents work in isolated git worktrees automatically created before starting. The end-to-end flow:

1. Solve the request
2. Run `./singularity build` to deploy (build both the frontend and server and register the gateway)
3. The app becomes available at `http://<worktree>.localhost:9000` (always include `http://` so the URL is clickable)
4. Once changes are reviewed and ready, commit and run `./singularity push` to merge back to main (pulls main first, merges, pushes). NEVER run `git commit`, always use the CLI. NEVER push unless the user explicitly said so.

RULES:

- NEVER run `./singularity push` unless instructed to. The user needs to review your code first.
- NEVER commit files yourself (this will create branch conflicts). Always use `./singularity push -m "commit message"`
- NEVER run `drizzle-kit generate` or the migration runner manually — always go through `./singularity build`.
- **Review diffs are against the worktree merge-base, not `main`.** Use `git diff $(git merge-base HEAD main)` — not `git diff main`, which includes unrelated commits merged into main after the branch point.

### MCP Tools

Agents have access to MCP tools provided by the Singularity server. Key tools:

- `query_db` — Read-only SQL query against the worktree's PostgreSQL database. For **debugging and inspection only** — mutations are rejected at the DB level. Defaults to the agent's own worktree DB; pass `database` to query another worktree or `"singularity"` for main.
- `add_task` — **When the user asks to "add a task", always use this MCP tool.** Never use the TaskCreate tool (that is for the agent's own internal task tracking during implementation, not for adding tasks to the Singularity task system).

## Architecture

Every feature is a **plugin**. The core app is thin plumbing that connects plugins together via a slot-based extension system.

Always READ the plugin architecture doc to understand design, caveats, and rules:

- Frontend: [`plugins/framework/plugins/web-sdk/CLAUDE.md`](plugins/framework/plugins/web-sdk/CLAUDE.md)
- Backend: [`plugins/framework/plugins/server-core/CLAUDE.md`](plugins/framework/plugins/server-core/CLAUDE.md)

Think carefully about the plugin's boundaries, APIs, etc. when designing plugins, as it is the load-bearing infra of the entire project.

### Collection-consumer separation

When a plugin collects sub-plugin contributions (e.g. facets, checks, collected dirs), consumers must use only the **generic collection API** — never import or name individual contributors. The collection plugin owns the registry and generic interface; each contributor implements the internal details. Adding or removing a contributor updates all consumers automatically with zero code changes. If a consumer needs to reference a specific contributor, the abstraction is leaking — redesign the generic API instead.

### Plugin boundary rules (enforced by `./singularity check plugin-boundaries`)

- **One barrel per runtime.** `plugins/<name>/<runtime>/index.ts` is the only cross-plugin entry point. No `api.ts`, no deep paths.
- **Cross-plugin import grammar.** Only runtime barrels are legal: `@plugins/<name>/{web,server,core}` for top-level plugins, or `@plugins/<name>/plugins/.../.../{web,server,core}` for any nesting depth. `shared/` is plugin-private — cross-plugin imports from `shared/` are forbidden (enforced by R10). Forbidden: paths that go *inside* a barrel (`/web/components/`, `/server/internal/`, etc.), workspace-name imports (`@singularity/plugin-shell`), and relative `../` escapes into another plugin's tree.
- **No cross-plugin re-exports.** Import the source barrel directly — never proxy another plugin's symbols through your own barrel. Re-exports hide the real dependency. Right: `import { X } from "@plugins/tasks/plugins/task-draft-form/web"`. Wrong: re-exporting `X` from `@plugins/tasks/web` so others don't have to.
- **Barrel purity.** Each `index.ts` may only contain `import` statements, re-exports of the plugin's own internal files, type aliases, and a single `export default <definePlugin(...)>`. No `const`/`let`, no logic, no side effects.
- **Registry exclusivity.** Default-export imports (`import fooPlugin from "@plugins/foo/web"`) are only allowed in `web/src/plugins.ts` and `plugins/framework/plugins/server-core/bin/plugins.ts`.
- **No cycles.** The cross-plugin import graph must be a DAG. Type-only imports count as edges.
- **Before writing a helper, search `docs/plugins-details.md` for it** — public exports, contributions, server endpoints, and reverse indexes (who imports me, who contributes to my slots, who calls my endpoints) for every plugin. The slim `docs/plugins-compact.md` is auto-loaded by agents; read the full `plugins-details.md` on demand. Each plugin also has its own `plugins/<…>/CLAUDE.md` with hand-written prose plus an autogen reference block — open that one when working inside a specific plugin. All three are kept in sync by the `plugins-doc-in-sync` check.

### Folder Structure

```
├── plugins/          # All features, each as a self-contained plugin
│   ├── framework/    # Framework primitives (web-sdk: slots, contributions)
│   └── {name}/
│       ├── web/      # Frontend code
│       ├── server/   # Backend code
│       ├── core/     # Public API — types/utils importable cross-plugin and from server/web
│       ├── shared/   # Private DRY — shared between web/server within this plugin only, never imported cross-plugin
│       ├── lint/     # ESLint rules contributed by this plugin (optional)
│       └── check/    # Custom Check[] enforced by ./singularity check (optional)
├── web/              # Frontend bootstrap (SPA shell, plugin registry)
├── gateway/          # Namespace proxy (Go). See [`gateway/CLAUDE.md`](gateway/CLAUDE.md)
├── cli/              # Agent CLI (TypeScript, Commander.js)
├── sidequests/       # Independent side projects (see Sidequests section below)
└── research/         # Research docs and plans
```

### Workspaces

The project uses bun workspaces (defined in root `package.json`). Run `bun install` from the repo root. Shared dependencies (react, icons, types) live in the root `package.json`. Plugin-specific dependencies live in each plugin's `package.json`.

### Key Plugins

- `shell` — App layout (sidebar, toolbar, main area, status bar). Defines the standard slots other plugins contribute to.

## CLI

### Deploy

Always deploy after all changes, fixes, implementations:

```bash
./singularity build
```

> Run from the worktree directory (the primary working directory), not the main repo root.

This will:

- Regenerate DB migrations from `schema.ts` (server applies them on restart)
- Build the frontend
- Build and restart the server
- Notify the gateway that the app is available for this worktree.

The gateway serves the app automatically at `http://<worktree>.localhost:9000`.

> **NEVER run `./singularity start`** (compiles and daemonizes the gateway) unless the user explicitly asks — this is a one-time system-level operation, not part of the normal agent workflow.

### Check

Run repo validation checks (e.g. `schema.ts` matches committed migrations):

```bash
./singularity check                       # run all checks
./singularity check --list                # list available checks
./singularity check migrations-in-sync    # run a single check (check id as positional arg)
```

Checks also run automatically as the first step of `push`, and (unless `--skip-checks` is passed) at the start of `build` after migration/doc generation. New built-in checks live in `plugins/framework/plugins/tooling/plugins/checks/core/` and are registered in `plugins/framework/plugins/tooling/plugins/checks/core/index.ts`.

Plugins can also contribute their own checks (no codegen, no registry edits — discovered at runtime):

- `plugins/<name>/lint/index.ts` — default-export `{ name: "<plugin-id>", rules: { ... } }` of ESLint v9 rule modules. The root `eslint.config.ts` walks every `lint/index.ts` and enables each rule as `error` repo-wide (`**/*.{ts,tsx}`) — a contributed lint rule applies everywhere, like a plugin-contributed check, not just within the contributing plugin's subtree. The `eslint` built-in check runs the resulting config.
- `plugins/<name>/check/index.ts` — default-export `Check | Check[]` (the same `Check` interface as built-ins). Discovered automatically when `./singularity check` runs. Convention: id as `<plugin-name>:<check-id>` to avoid collisions with built-ins.

Available built-in checks:

- `migrations-in-sync` — fails if plugin `tables.ts` / `schema.ts` changes would generate a new migration not yet committed. Fix by running `./singularity build` and committing the generated file.
- `type-check` — unified TypeScript + type-aware-ESLint check: builds each tsconfig target's TS program once and reads both tsc diagnostics and lint results off it. Plugin-contributed rules in `plugins/<name>/lint/` are auto-registered into the shared lint config.

### Push

Once changes are committed and reviewed, merge back to main:

```bash
./singularity push
```

This will:
1. Run validation checks
2. Check for uncommitted changes (fails if dirty)
3. Push the worktree branch to remote
4. Pull main (`--ff-only`) to ensure it's up to date
5. Merge the branch into main (from the main worktree)
6. Push main to remote

> **CRITICAL — NEVER push or commit on your own initiative.** Wait for the user to ask.
> NEVER use raw git commands (`git commit`, `git push`). Always use `./singularity push -m "message"`.
> "push", "publish", "ship" all mean `./singularity push`.

### `--from-main` (dangerous)

`./singularity push --from-main -m "…"` commits and pushes straight from main, skipping the worktree-merge flow. **Agents must never pass this flag without explicit user approval in the current conversation** — not from memory, not from a prior session, not from a CLAUDE.md rule. The user must say so, in this conversation, for this push. If you're on main and no worktree branch exists for the changes, stop and ask rather than reaching for this flag.

## Ports

- The gateway listens on **port 9000** for all browser traffic, routed by subdomain (`<name>.localhost:9000`). The main namespace (agent manager app, served from `main`) is always at `singularity.localhost:9000`.
- Backends do **not** listen on TCP. The gateway hands each backend a per-worktree Unix domain socket at `~/.singularity/sockets/<name>.sock` and dials it directly. There is no backend port range to allocate.

## Screenshots

Take screenshots of the app using Playwright (Chromium is pre-installed).

For a single static snapshot:

```bash
bun run playwright screenshot --wait-for-timeout 3000 --viewport-size "1280,800" http://<worktree>.localhost:9000 /tmp/screenshot.png
```

If you need to **verify behavior** (click a button, confirm state, capture a
before/after), go straight to a scripted Playwright run — don't take blind
static screenshots first. Use the helper at [`e2e/screenshot.mjs`](e2e/screenshot.mjs)
or copy it as a starting point:

```bash
bun e2e/screenshot.mjs \
  --url http://<worktree>.localhost:9000/c/<id> \
  --click "Design docs" \
  --out /tmp/docs
```

It prints the matched button's `disabled` / `aria-pressed` / text state and
writes `-before.png` + `-after.png`, so a single run tells you whether the
feature actually works.

## Debugging

Browser/server logs persist to `~/.singularity/worktrees/<wt>/logs/<channel>.jsonl` (one JSON `{t,stream,line}` per line). Emit from the browser via `clientLog(channel, line)`. Read them by `tail`/`cat` on the file. See [`plugins/debug/plugins/logs/CLAUDE.md`](plugins/debug/plugins/logs/CLAUDE.md).

## Sidequests

Independent projects that live in `sidequests/`, not directly related to Singularity. Each has its own `CLAUDE.md`.

- [`sidequests/ui-mastery/`](sidequests/ui-mastery/CLAUDE.md) — Research and tooling to make agents produce professional UI. **Read before any UI polish work.** Feature agents build functionality; polish agents apply UI Mastery knowledge separately.

## Instructions

### Agent Workflow Rules

- Most features first require a thoughtful design phase. Use the project `plan` SKILL for this phase. This is important to correctly write the plan doc at the right location. Do NOT use `EnterPlanMode` tool.
- New features should be implemented as plugins in `plugins/`. See [`plugins/framework/plugins/web-sdk/CLAUDE.md`](plugins/framework/plugins/web-sdk/CLAUDE.md) for how to create one.
- When creating a new top-level app, use the `create-app` SKILL ([`.claude/skills/create-app/SKILL.md`](.claude/skills/create-app/SKILL.md)).
- Before debugging, read the `debug` SKILL ([`.claude/skills/debug/SKILL.md`](.claude/skills/debug/SKILL.md)) — map of logs, profiling, crashes, DB, and queue surfaces.
- Before any theming / token / design-standard work, read the `theme` SKILL ([`.claude/skills/theme/SKILL.md`](.claude/skills/theme/SKILL.md)) — design tokens, tweakcn, per-app config, and typography/radius/z-index enforcement.
- Always edit files in your worktree, not the main branch.
- **Avoid `find` for file searches.** Unbounded `find` in this repo has crashed macOS (65k DIR FDs via the bfs shim). Use `rg --files -g '<glob>'` or `fd '<regex>'` instead. Only use `find` with `-maxdepth` or `-prune`.
- **STOP on unexpected failures; never improvise around them.** If something fails in a way you don't fully understand, surface it and ask — do NOT route around it (e.g. falling back to curl after an MCP call fails). A loud failure is debuggable; a workaround built on a broken assumption is not.
- **Subagents default to Sonnet.** When spawning any `Agent` call, always pass `model: "sonnet"` explicitly. Never omit the model and let it default to Opus. Only use Opus for load-bearing, complex implementation tasks — research, lookup, synthesis, and reporting are all Sonnet work.
- **On breakage, rebase to HEAD first.** When the build fails to start or something is broken in an unexpected way, rebase the worktree branch onto `main` (`git fetch origin main && git rebase origin/main`) — the issue may already be fixed upstream.
- **Don't memorize gotchas — report them so they get fixed structurally.** When you hit a footgun (a silent-`undefined` API, a "you must also update X" coupling, a boot-crash-if-misplaced rule, a build trap), do NOT write a memory file describing the workaround. A memory only documents the trap for one agent; the trap still exists for everyone else. Instead, surface it to the user (or `add_task` it) so it can be eliminated at the source — a required type, a `./singularity check`, a lint rule, or a derived value. The right response to a footgun is to remove the footgun. Durable how-it-works knowledge belongs in the relevant `CLAUDE.md` / `docs/`, not in personal memory.
- **When the user explicitly says "Exit"**, signal the outcome via exactly one MCP tool call, then write your final wrap-up message:
  1. Call exactly one MCP tool to signal the outcome:
     - `exit_clean` — everything went smoothly, nothing I need to know. The conversation will close automatically.
     - `flag_raise({ reason })` — something needs my attention (caveats, partial outcomes, follow-ups, skipped work, or the push didn't land). Use `reason` for short bullets describing what I should know.
  2. Write your final wrap up message, including things like summary, issues encountered, existing caveats, follow ups.

### Testing

Tests are **optional and manual** — nothing runs them automatically (no `./singularity check`, no CI, no `build`/`push` gate). When you do run tests, always pass an **explicit file or folder path** — there is no blanket "run everything" target.

- **`bun:test` is the default runner.** Every `*.test.ts(x)` in the repo is a `bun:test` unit test (pure logic / lint / check / server / web-logic), except the one vitest suite below. Run a specific file or folder:
  ```bash
  bun test plugins/page/plugins/editor/core/block-ops.test.ts
  bun test plugins/page/plugins/editor                 # a folder
  ```
- **`vitest` is reserved for the one browser/DOM suite** — `plugins/framework/plugins/web-core/web/__tests__/plugin-render.test.tsx` (jsdom + React + the `@` SPA alias + the full plugin graph). Run it via web-core's `test` script — see [`plugins/framework/plugins/web-core/CLAUDE.md`](plugins/framework/plugins/web-core/CLAUDE.md).
- **Prerequisite:** `node_modules` must be populated. Any `./singularity` invocation (and `build` as step 1) runs `bun install` — so run tests after a build, or `bun install` first.
- Do **not** run a blanket `bun test` from the repo root: it would also try to load the vitest file and fail. If you ever need a broad sweep, scope it to a folder or pass `--path-ignore-patterns='**/web-core/web/__tests__/**'`.

### Coding Style

This is the single most important coding principle:

- **Prefer the clean design over the hacky one, even when it's more work.** Ask: "what primitive or abstraction would make this *and* future similar cases trivial?" — then build that, rather than patching the symptom.

---

- **Group related plugins under an umbrella.** For 2+ related plugins, prefer an umbrella parent (`plugins/<umbrella>/plugins/<child>/`) over flat top-level entries. This keeps `plugins/` readable as semantic categories rather than an unbounded flat list. The umbrella doesn't need to re-export children's APIs — each sub-plugin owns its barrel.
- **No polling — use push-based mechanisms.** Never use `setInterval`/`setTimeout` loops to check for changes. Use file watchers, DB `LISTEN/NOTIFY`, WebSocket messages, the `live-state` primitive, or the `events`/`jobs` plugin. If the upstream source has no change signal, use a `defineJob` with a schedule (not an in-process timer) and document why.
- **Fail loudly — never silence errors.** Visible crashes are good: they surface the structural issue so it gets fixed. Never swallow exceptions, hide error states, or add fallbacks that mask broken assumptions. ESLint enforces `no-floating-promises` and `no-bare-catch`. Correct patterns: `await promise` (preferred), `.catch((err) => { if (err instanceof Expected) handle(err); else throw err; })` (specific handling), or `void promise` (intentional fire-and-forget). Never: bare `promise;`, `.catch(() => {})`, `.catch(console.error)`.
- **Fix the structural issue, not the specific instance.** When something breaks, take a step back and ask why it was possible in the first place. Rethink the abstractions — a type constraint, a schema change, or an invariant enforced at the boundary can prevent the entire class of bug. A targeted fix in one call site leaves the rest exposed.
------------------------------------

@docs/plugins-compact.md
