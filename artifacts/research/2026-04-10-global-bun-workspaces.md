# Bun Workspaces Migration

## Context

Plugins live outside `web/node_modules`'s ancestor chain. When a plugin imports a third-party package (e.g. `sonner`), Node resolution fails — it walks up from `plugins/shell/web/` and never hits `web/node_modules`. Today this is fixed by adding a manual alias in **both** `vite.config.ts` and `tsconfig.app.json` for every such package. This doesn't scale.

Bun workspaces use isolation-first resolution (like pnpm): each workspace only gets symlinks for its declared deps. Shared deps (react, icons, types) go in the root `package.json` so they're available to all workspaces via standard Node resolution. Plugin-specific deps go in the plugin's own `package.json`.

## Plan

### Step 1 — Root `package.json`

Create `package.json` at repo root:

```json
{
  "name": "singularity",
  "private": true,
  "workspaces": ["web", "server", "plugin-core", "plugins/*"]
}
```

### Step 2 — `plugin-core/package.json`

```json
{
  "name": "@singularity/plugin-core",
  "private": true,
  "version": "0.0.1",
  "peerDependencies": {
    "react": "^19.1.0"
  }
}
```

### Step 3 — Plugin `package.json` files

Every plugin gets one. Only plugins with specific deps declare them. Shared web deps (`react`, `react-icons`, `lucide-react`, types) live in the root `package.json`.

| Plugin | Dependencies |
|---|---|
| `shell` | `sonner` |
| `terminal` | `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`, `bun-pty` |
| `dummy-button` | (none) |
| `dummy-detail` | (none) |
| `dummy-list` | (none) |
| `dummy-terminal` | (none) |

Example (`plugins/shell/package.json`):
```json
{
  "name": "@singularity/plugin-shell",
  "private": true,
  "version": "0.0.1",
  "dependencies": { "sonner": "^2.0.7" }
}
```

Dummy plugins get the same shape with no `dependencies` field.

### Step 4 — Move deps out of `web/package.json` and `server/package.json`

**Remove from `web/package.json`**: `sonner`, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links` (moved to plugin package.jsons)

**Remove from `server/package.json`**: `bun-pty` (moved to `plugins/terminal/package.json`)

### Step 5 — Remove third-party aliases

**`web/vite.config.ts`** — remove 6 aliases (`react-icons`, `lucide-react`, `@xterm/*`, `sonner`). Keep `@`, `@core`, `@plugins`.

**`web/tsconfig.app.json`** — remove same 6 path entries. Remove `typeRoots` (default resolution finds hoisted `@types`). Keep `@/*`, `@core`, `@plugins/*`.

**`server/tsconfig.json`** — remove `bun-pty` path. Keep `@plugins/*`.

### Step 6 — Reinstall

```sh
rm web/bun.lock server/bun.lock
rm -rf web/node_modules server/node_modules
bun install   # from repo root — creates root bun.lock + root node_modules
```

### Step 7 — Update docs

- **`plugin-core/CLAUDE.md`** "External dependencies" section: replace alias instructions with workspace instructions
- **`server/CLAUDE.md`** "Path Aliases" section: remove `bun-pty` alias guidance
- **Root `CLAUDE.md`** deploy section: `bun install` from root, not `cd web && bun install`

## Files to modify

| File | Action |
|---|---|
| `package.json` | **Create** — workspace root |
| `plugin-core/package.json` | **Create** — workspace member |
| `plugins/*/package.json` (x6) | **Create** — workspace members |
| `web/package.json` | **Edit** — remove 4 deps |
| `server/package.json` | **Edit** — remove bun-pty |
| `web/vite.config.ts` | **Edit** — remove 6 aliases |
| `web/tsconfig.app.json` | **Edit** — remove 6 paths + typeRoots |
| `server/tsconfig.json` | **Edit** — remove bun-pty path |
| `plugin-core/CLAUDE.md` | **Edit** — update external deps docs |
| `server/CLAUDE.md` | **Edit** — update path alias docs |
| `CLAUDE.md` | **Edit** — update deploy instructions |
| `web/bun.lock`, `server/bun.lock` | **Delete** — replaced by root `bun.lock` |

## Verification

```sh
bun install                    # single root install
cd web && bun run build        # tsc + vite — confirms all imports resolve
cd ../server && bun run start  # confirms bun-pty resolves from hoisted node_modules
```
