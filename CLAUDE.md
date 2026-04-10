# Singularity

Agent manager app whose goal is to fix todos faster than they are created. The app will be used to improve itself.

The app is a todo nested list of tasks agents need to execute. Each agent executes in its own isolated `worktree` and deploys to its own `namespace`. The UI allows seamlessly switching between namespaces to inspect agent work.

## Agent Workflow

Follow this workflow for all tasks (design, bug fix, ...)

Agents work in isolated git worktrees. The end-to-end flow:

1. Start with a prompt (design a feature, fix a bug, ...)
2. Enter a worktree using `EnterWorktree` with an explicit feature name
3. Make code changes in the worktree
4. Run `./singularity build` to deploy (build both the frontend and server and register the gateway)
5. The app becomes available at `http://<name>.localhost:9000` (always include `http://` so the URL is clickable)


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
└── artifacts/        # Research docs, plans, agent memory
```

### Workspaces

The project uses bun workspaces (defined in root `package.json`). Run `bun install` from the repo root. Shared dependencies (react, icons, types) live in the root `package.json`. Plugin-specific dependencies live in each plugin's `package.json`.

### Key Plugins

- `shell` — App layout (sidebar, toolbar, main area, status bar). Defines the standard slots other plugins contribute to.

## Deploy

Always deploy after all changes, fixes, implementations:

```bash
./singularity build
```

This will build the frontend and backend, as well as notifying the gateway the app is available.
The gateway serve the app automatically at `http://<name>.localhost:9000`.

## Ports

- Port range: **9000–10000** (Those are handled automatically by the gateway. Make sure to run the `build` CLI command)
- The head namespace (agent manager app) is always deployed at **port 9000**

## Sidequests

Independent projects that live in `sidequests/`, not directly related to Singularity. Each has its own `CLAUDE.md`.

- **`claude-web`** — Browser-based Claude Code sessions via ttyd + tmux. See [`sidequests/claude-web/CLAUDE.md`](sidequests/claude-web/CLAUDE.md).

## Instructions

When working on this project, follow these instructions thoughtfully:

- Most features first require a thoughtful design phase. Use the project `plan` SKILL for this phase. This is important to correctly write the plan doc at the right location. Do NOT use `EnterPlanMode` tool.
- New features should be implemented as plugins in `plugins/`. See [`plugin-core/CLAUDE.md`](plugin-core/CLAUDE.md) for how to create one.
