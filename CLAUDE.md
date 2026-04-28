# Singularity

Singularity is a new self-evolving app for the agentic era. The vision has a few steps:

- At first, the app itself is an Agent manager app whose goal is to fix todos faster than they are created. The app will be used to improve itself.

  The app is a nested todo list of tasks agents need to execute. Each agent executes in its own isolated `worktree` (including this current session) and deploys to `http://<worktree>.localhost:9000`. The UI allows seamless switching between namespaces to inspect agent work.

- The app evolves into a Notion-like WeChat: a single unified surface where agents compose user-tailored apps on the fly from plugin building blocks. Notion gives users composable blocks (databases, pages, views) to fit their workflow; Singularity does the same at the *app* level, with agents doing the composing. The agent manager becomes one such composition among many, sharing the same plugins and primitives.

- The app scope will be expanded to research Agents' limits and interactions. Projects will ultimately move outside of coding into the physical world.

## Agent Workflow

Agents work in isolated git worktrees automatically created before starting. The end-to-end flow:

1. Solve the request
2. Run `./singularity build` to deploy (build both the frontend and server and register the gateway)
3. The app becomes available at `http://<worktree>.localhost:9000` (always include `http://` so the URL is clickable)
4. Once changes are reviewed and ready, commit and run `./singularity push` to merge back to main (pulls main first, merges, pushes). NEVER run `git commit`, always use the CLI. NEVER push unless the user explicitly said so.

RULES:

- NEVER run `./singularity push` unless instructed to. The user needs to review your code first.
- NEVER commit files yourself (this will create branch conflicts). Always use `./singularity push -m "commit message"`
- NEVER run `drizzle-kit generate` or `bun src/db/migrate.ts` manually — always go through `./singularity build`.

## Architecture

Every feature is a **plugin**. The core app is thin plumbing that connects plugins together via a slot-based extension system.

Always READ the plugin architecture doc to understand design, caveats, and rules:

- Frontend: [`plugin-core/CLAUDE.md`](../plugin-core/CLAUDE.md)
- Backend: [`server/CLAUDE.md`](../server/CLAUDE.md)

Think carefully about the plugin's boundaries, APIs, etc. when designing plugins, as it is the load-bearing infra of the entire project.

### Plugin boundary rules (enforced by `./singularity check --plugin-boundaries`)

- **One barrel per runtime.** `plugins/<name>/<runtime>/index.ts` is the only cross-plugin entry point. No `api.ts`, no deep paths.
- **Cross-plugin import grammar.** Only `@plugins/<name>/web`, `@plugins/<name>/server`, or `@plugins/<name>/shared` are legal import paths from outside the plugin. Any deeper path (e.g. `@plugins/shell/web/slots`) is forbidden. Importing a sibling plugin by its bun-workspace name (e.g. `@singularity/plugin-shell`) is also forbidden — those resolve through `node_modules` symlinks and bypass the boundary checks.
- **Barrel purity.** Each `index.ts` may only contain `import` statements, re-exports, type aliases, and a single `export default <definePlugin(...)>`. No `const`/`let`, no logic, no side effects.
- **Registry exclusivity.** Default-export imports (`import fooPlugin from "@plugins/foo/web"`) are only allowed in `web/src/plugins.ts` and `server/src/plugins.ts`.
- **No cycles.** The cross-plugin import graph must be a DAG. Type-only imports count as edges.
- **Before writing a helper, search `docs/plugins-details.md` for it** — public exports, contributions, server endpoints, and reverse indexes (who imports me, who contributes to my slots, who calls my endpoints) for every plugin. The slim `docs/plugins-compact.md` is auto-loaded by agents; read the full `plugins-details.md` on demand. Each plugin also has its own `plugins/<…>/CLAUDE.md` with hand-written prose plus an autogen reference block — open that one when working inside a specific plugin. All three are kept in sync by the `plugins-doc-in-sync` check.

### Folder Structure

```
├── plugin-core/      # Plugin framework primitives (slots, contributions)
├── plugins/          # All features, each as a self-contained plugin
│   └── {name}/
│       ├── web/      # Frontend code
│       └── server/   # Backend code (future)
├── web/              # Frontend bootstrap (SPA shell, plugin registry)
├── gateway/          # Namespace proxy (Go). See [`gateway/CLAUDE.md`](gateway/CLAUDE.md)
├── server/           # Backend (TypeScript/Bun)
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
./singularity check --migrations-in-sync  # run a single check
```

Checks also run automatically as the first step of `push`. New checks are added in `cli/src/checks/` and registered in `cli/src/checks/index.ts`.

Available checks:

- `migrations-in-sync` — fails if `server/src/db/schema.ts` would generate a new migration not yet committed. Fix by running `./singularity build` and committing the generated file.

### Push

Once changes are committed and reviewed, merge back to main:

```bash
./singularity push
```

This will:
1. Run validation checks (skip with `--skip-checks`)
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

- Port range: **9000–10000** (Those are handled automatically by the gateway. Make sure to run the `build` CLI command)
- The main namespace (agent manager app, served from `main`) is always deployed at **port 9000** as `singularity.localhost:9000`

## Screenshots

Take screenshots of the app using Playwright (Chromium is pre-installed).

For a single static snapshot:

```bash
bunx playwright screenshot --wait-for-timeout 3000 --viewport-size "1280,800" http://<worktree>.localhost:9000 /tmp/screenshot.png
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

## Sidequests

Independent projects that live in `sidequests/`, not directly related to Singularity. Each has its own `CLAUDE.md`.

- [`sidequests/ui-mastery/`](sidequests/ui-mastery/CLAUDE.md) — Research and tooling to make agents produce professional UI. **Read before any UI polish work.** Feature agents build functionality; polish agents apply UI Mastery knowledge separately.

## Instructions

When working on this project, follow these instructions thoughtfully:

- Most features first require a thoughtful design phase. Use the project `plan` SKILL for this phase. This is important to correctly write the plan doc at the right location. Do NOT use `EnterPlanMode` tool.
- New features should be implemented as plugins in `plugins/`. See [`plugin-core/CLAUDE.md`](plugin-core/CLAUDE.md) for how to create one.
- Always edit files in your worktree, not the main branch.
- **Avoid `find` for file searches.** Claude Code's shell shim reroutes `find` to a bundled bfs that holds an unbounded directory FD frontier; broad finds against this repo (with `node_modules` + worktrees) accumulate ~65k DIR FDs and have crashed macOS. Use `rg --files -g '<glob>'` or `fd '<regex>'` — both respect `.gitignore` and have bounded FDs. Only use `find` when you need its predicates (`-mtime`, `-size`, `-perm`, etc.), and always scope it with `-prune` or `-maxdepth N`. The `.claude/hooks/guard-find.sh` PreToolUse hook denies unbounded `find` calls.
- **STOP on unexpected failures; never improvise around them.** If an MCP tool errors, a CLI behaves strangely, a write lands somewhere you didn't expect, a connection is refused, or any operation fails in a way you don't fully understand — surface the failure clearly and ask. Do NOT route around it (e.g. falling back to bash + curl after an MCP call fails, retrying against a different host, or "trying the next thing that looks close enough"). One real incident: a silent MCP handshake failure caused an agent to curl the main namespace and corrupt its DB. A loud failure is debuggable; a workaround built on a broken assumption is not.
- **Prefer the clean, modern, best-practice design over the hacky one, even when it's more work.** This applies to *both* bug fixes *and* new feature design. Every concrete task — a bug, a missing behavior, a requested feature — is a toy case for a larger structural question. Ask: "what general primitive, plugin, slot, or abstraction would make this *and* future similar cases trivial?" — then build that, rather than patching the symptom or bolting the feature onto existing code. This might include refactoring or creating new plugins.
- **Group related plugins under an umbrella.** For 2+ related plugins, prefer an umbrella parent (`plugins/<umbrella>/plugins/<child>/`) over flat top-level entries. This keeps `plugins/` readable as semantic categories rather than an unbounded flat list. The umbrella doesn't need to re-export children's APIs — each sub-plugin owns its barrel.

------------------------------------

@docs/plugins-compact.md
