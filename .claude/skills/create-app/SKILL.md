---
name: create-app
description: >
  Rules for creating a new top-level app in the Singularity platform.
  Read BEFORE creating any new app.
---

# Create New App

## Rules

- New top-level apps go in: `plugins/apps/<name>/`
- The top-level app plugin must be **empty** — no slots, no components, no logic. It is a namespace only.
- All app content goes in sub-plugins: `plugins/apps/<name>/plugins/<feature>/`
- The app shell (layout, routing) is a sub-plugin, not the top-level plugin.
