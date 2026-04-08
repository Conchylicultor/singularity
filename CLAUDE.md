# Singularity

Singularity is an agent manager app whose goal is to fix todos faster than they are created.

## Core idea

The app is just a todo nested list of tasks agents need to execute.
Each agent execute the task in it's own isolated `worktree` and deploy it to its own `namespace`.

The UI allow to seamlessly switch between namespace to inspect the agent work.

(This is the core idea, in practice many features are added on top of this)

## Architecture

### Status

The project is just getting started, not much as yet been build in this version.

### Folder structure

This app is composed of self-contained independent modules:

- `gateway/`: Proxy to manage the various `namespace` instances and redirect the trafic to the correct one. (`Go`)
- `cli/`: Agent CLI to build and deploy the app (`Python`)
- `web/`: Frontend core code (`TypeScript`)
- `server/`: Backend code (`Go`)
- `plugins/`: Individual components
- `ide/`: Theia based IDE
- `artifacts/`: Agent documentation and memory

### Plugins

## Instructions

When working on this project, follow those instructions thoughtfully:

- Most features first require a thoughfull design phase. Use the project `plan` SKILL for this phase. This is important to correctly write the plan doc at the right location. Do NOT use `EnterPlanMode` tool.
