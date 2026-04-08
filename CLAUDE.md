# Singularity

Agent manager app whose goal is to fix todos faster than they are created.

The app is a todo nested list of tasks agents need to execute. Each agent executes in its own isolated `worktree` and deploys to its own `namespace`. The UI allows seamlessly switching between namespaces to inspect agent work.

## Architecture

Every feature is a **plugin**. The core app is thin plumbing that connects plugins together via a slot-based extension system. See [`plugin-core/CLAUDE.md`](plugin-core/CLAUDE.md) for the plugin API.

### Folder Structure

```
├── plugin-core/      # Plugin framework primitives (slots, contributions)
├── plugins/          # All features, each as a self-contained plugin
│   └── {name}/
│       ├── web/      # Frontend code
│       └── server/   # Backend code (future)
├── web/              # Frontend bootstrap (SPA shell, plugin registry)
├── gateway/          # Namespace proxy (Go, future)
├── server/           # Backend (Go, future)
├── cli/              # Agent CLI (Python, future)
├── ide/              # Theia-based IDE
└── artifacts/        # Research docs, plans, agent memory
```

### Key Plugins

- `shell` — App layout (sidebar, toolbar, main area, status bar). Defines the standard slots other plugins contribute to.

## Instructions

When working on this project, follow these instructions thoughtfully:

- Most features first require a thoughtful design phase. Use the project `plan` SKILL for this phase. This is important to correctly write the plan doc at the right location. Do NOT use `EnterPlanMode` tool.
- New features should be implemented as plugins in `plugins/`. See [`plugin-core/CLAUDE.md`](plugin-core/CLAUDE.md) for how to create one.
