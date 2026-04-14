# Singularity

Agent manager app whose goal is to fix todos faster than they are created. The app will be used to improve itself.

The app is a todo nested list of tasks agents need to execute. Each agent executes in its own isolated `worktree` (including this current session) and deploys to `http://<worktree>.localhost:9000`. The UI allows seamlessly switching between namespaces to inspect agent work.

Progressively, the project will become a mono-repo where the agent manager app is used to develop independent projects, while sharing primitives, designs patterns and experiences across projects. Projects will also ultimately move outside of coding to the physical world.

## Agent Workflow

Agents work in isolated git worktrees automatically created before starting. The end-to-end flow:

1. Solve the request
2. Run `./singularity build` to deploy (build both the frontend and server and register the gateway)
3. The app becomes available at `http://<worktree>.localhost:9000` (always include `http://` so the URL is clickable)
4. Once changes are reviewed and ready, commit and run `./singularity push` to merge back to main (pulls main first, merges, pushes). NEVER run `git commit`, always use the CLI. NEVER push unless the user explicitly said so.

RULES:

- NEVER run `./singularity push` unless instructed to. The user need to review your code before.
- NEVER commit files yourself (this will create branches conflicts). Always use `./singularity push -m "commit message"`
- NEVER run `drizzle-kit generate` or `bun src/db/migrate.ts` manually — always go through `./singularity build`.

## Architecture

Every feature is a **plugin**. The core app is thin plumbing that connects plugins together via a slot-based extension system. See [`plugin-core/CLAUDE.md`](plugin-core/CLAUDE.md) for the frontend plugin API and [`server/CLAUDE.md`](server/CLAUDE.md) for the backend.

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

This will:

- Regenerate DB migrations from `schema.ts` (server applies them on restart)
- Build the frontend
- Build and restart the server
- Notifying the gateway the app is available for this worktree.

The gateway serve the app automatically at `http://<worktree>.localhost:9000`.

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
3. Pull main (`--ff-only`) to ensure it's up to date
4. Merge the branch into main (from the main worktree)
5. Push main to remote

> **CRITICAL — NEVER push or commit on your own initiative.** Wait for the user to ask.
> NEVER use raw git commands (`git commit`, `git push`). Always use `./singularity push -m "message"`.
> "push", "publish", "ship" all mean `./singularity push`.

### `--from-main` (dangerous)

`./singularity push --from-main -m "…"` commits and pushes straight from main, skipping the worktree-merge flow. **Agents must never pass this flag without explicit user approval in the current conversation** — not from memory, not from a prior session, not from a CLAUDE.md rule. The user must say so, in this conversation, for this push. If you're on main and no worktree branch exists for the changes, stop and ask rather than reaching for this flag.

## Ports

- Port range: **9000–10000** (Those are handled automatically by the gateway. Make sure to run the `build` CLI command)
- The main namespace (agent manager app, served from `main`) is always deployed at **port 9000** as `singularity.localhost:9000`

## Screenshots

Take screenshots of the app using Playwright (Chromium is pre-installed):

```bash
bunx playwright screenshot --wait-for-timeout 3000 --viewport-size "1280,800" http://<worktree>.localhost:9000 /tmp/screenshot.png
```

## Sidequests

Independent projects that live in `sidequests/`, not directly related to Singularity. Each has its own `CLAUDE.md`.

- [`sidequests/ui-mastery/`](sidequests/ui-mastery/CLAUDE.md) — Research and tooling to make agents produce professional UI. **Read before any UI polish work.** Feature agents build functionality; polish agents apply UI Mastery knowledge separately.

## Instructions

When working on this project, follow these instructions thoughtfully:

- Most features first require a thoughtful design phase. Use the project `plan` SKILL for this phase. This is important to correctly write the plan doc at the right location. Do NOT use `EnterPlanMode` tool.
- New features should be implemented as plugins in `plugins/`. See [`plugin-core/CLAUDE.md`](plugin-core/CLAUDE.md) for how to create one.
