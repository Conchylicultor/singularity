# Singularity

Agent manager app whose goal is to fix todos faster than they are created. The app will be used to improve itself.

The app is a todo nested list of tasks agents need to execute. Each agent executes in its own isolated `worktree` and deploys to its own `namespace`. The UI allows seamlessly switching between namespaces to inspect agent work.

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
├── cli/              # Agent CLI (Python, future)
├── ide/              # Theia-based IDE
└── artifacts/        # Research docs, plans, agent memory
```

### Key Plugins

- `shell` — App layout (sidebar, toolbar, main area, status bar). Defines the standard slots other plugins contribute to.

## Deploy

```sh
cd web
bun install
bun run build
bunx vite preview --port 9000
```

## Ports

- Port range: **9000–10000**
- The head namespace (agent manager app) is always deployed at **port 9000**

## Instructions

When working on this project, follow these instructions thoughtfully:

- Most features first require a thoughtful design phase. Use the project `plan` SKILL for this phase. This is important to correctly write the plan doc at the right location. Do NOT use `EnterPlanMode` tool.
- New features should be implemented as plugins in `plugins/`. See [`plugin-core/CLAUDE.md`](plugin-core/CLAUDE.md) for how to create one.
