---
name: create-app
description: >
  Rules for creating a new top-level app in the Singularity platform.
  Read BEFORE creating any new app.
---

# Create New App

## Rules

- New top-level apps go in: `plugins/apps/plugins/<name>/`
- The top-level app plugin must be **empty** — no slots, no components, no logic. It is a namespace only.
- All app content goes in sub-plugins: `plugins/apps/plugins/<name>/plugins/<feature>/`
- The app shell (layout, routing) is a sub-plugin, not the top-level plugin.

## Example structure

```
plugins/apps/plugins/<name>/
  package.json
  web/index.ts              # Empty namespace plugin
  plugins/
    shell/
      package.json
      web/index.ts           # Contributes Apps.App, exports slots
      web/slots.ts
      web/components/
    <feature>/
      package.json
      web/index.ts           # Contributes to shell slots
```
