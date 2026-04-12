# Server Plugin Route Registration

## Context

Server routes (HTTP and WebSocket) are hardcoded in `server/src/plugins.ts` as centralized route tables. Every time a plugin adds a route, this central file must be edited with both an import and a route entry. This is unlike the frontend, where each plugin declares its own contributions locally via `PluginDefinition`.

The goal is to make each server plugin own its route declarations, with `server/src/plugins.ts` becoming a simple registry (list of imports) — structurally identical to `web/src/plugins.ts`.

## Design

### `ServerPluginDefinition` type

New file `server/src/types.ts`:

```typescript
import type { ServerWebSocket } from "bun";

export interface WsData {
  path: string;
}

export interface WsHandler {
  open(ws: ServerWebSocket<WsData>): void;
  message(ws: ServerWebSocket<WsData>, msg: string | Buffer): void;
  close(ws: ServerWebSocket<WsData>, code: number, reason: string): void;
}

export type HttpHandler = (req: Request) => Response | Promise<Response>;

export interface ServerPluginDefinition {
  id: string;
  name: string;
  httpRoutes?: Record<string, HttpHandler>;  // "METHOD /path" -> handler
  wsRoutes?: Record<string, WsHandler>;      // "/path" -> handler
}
```

### Plugin `server/` directory convention

Each plugin moves internal files into an `internal/` subfolder. Only the public API (`api.ts`) and plugin definition (`index.ts`) stay at top level:

```
plugins/{name}/server/
  index.ts        # Default export: ServerPluginDefinition (routes declared here)
  api.ts          # Optional: public API for other plugins to import
  internal/       # Handler implementations, business logic (never imported externally)
```

### Plugin registry

`server/src/plugins.ts` becomes a flat list:

```typescript
import type { ServerPluginDefinition } from "./types";
import terminalPlugin from "@plugins/terminal/server";
import buildPlugin from "@plugins/build/server";
import logsPlugin from "@plugins/logs/server";

export const plugins: ServerPluginDefinition[] = [
  logsPlugin,
  buildPlugin,
  terminalPlugin,
];
```

### Route collection in entry point

`server/src/index.ts` flattens routes from all plugins:

```typescript
import type { WsData, HttpHandler, WsHandler } from "./types";
import { plugins } from "./plugins";

const httpRoutes: Record<string, HttpHandler> = {};
const wsRoutes: Record<string, WsHandler> = {};

for (const plugin of plugins) {
  if (plugin.httpRoutes) Object.assign(httpRoutes, plugin.httpRoutes);
  if (plugin.wsRoutes) Object.assign(wsRoutes, plugin.wsRoutes);
}

// Bun.serve() block unchanged
```

## File changes

### Create

| File | Content |
|------|---------|
| `server/src/types.ts` | `WsData`, `WsHandler`, `HttpHandler`, `ServerPluginDefinition` |
| `plugins/terminal/server/internal/ws-handler.ts` | Current `index.ts` content (the `wsHandler` export) |
| `plugins/terminal/server/internal/pty-manager.ts` | Moved from `server/pty-manager.ts` |
| `plugins/build/server/internal/handle-build.ts` | Current `index.ts` content (`handleBuild`) |
| `plugins/logs/server/index.ts` | Minimal definition, no routes |

### Rewrite

| File | Change |
|------|--------|
| `plugins/terminal/server/index.ts` | Default export `ServerPluginDefinition` with `wsRoutes: { "/ws/terminal": wsHandler }` |
| `plugins/build/server/index.ts` | Default export `ServerPluginDefinition` with `httpRoutes: { "POST /api/build": handleBuild }` |
| `server/src/plugins.ts` | Plugin list (no more route tables) |
| `server/src/index.ts` | Import types from `./types`, add route-flattening loop |

### Unchanged

| File | Why |
|------|-----|
| `plugins/logs/server/api.ts` | Public API, no routes to declare |

### Update

| File | Change |
|------|--------|
| `server/CLAUDE.md` | Document new pattern |
| `plugin-core/CLAUDE.md` | Update server plugin file structure section |

## Gotchas

- **`import.meta.dir` in build plugin**: `handle-build.ts` uses `import.meta.dir + "/../../../web"` for the cwd. After moving to `internal/`, this needs one more `../` → `"/../../../.../web"`. Alternatively, use `import.meta.dir + "/../../../../web"` or resolve from project root.
- **Terminal import paths**: `internal/ws-handler.ts` imports types from server. Current relative path `../../../server/src/plugins` becomes `../../../../server/src/types`. Deep nesting — not a problem (Bun resolves it fine) but ugly. Could optionally add a `@server` path alias to `server/tsconfig.json` later.
- **No route collision detection**: `Object.assign` silently overwrites duplicates. Fine for now; can add a dev-mode check later if needed.

## Verification

1. `cd server && bun run dev` — server starts without errors
2. Open the web app, click Build toolbar button — `POST /api/build` works
3. Open a terminal pane — WebSocket connects to `/ws/terminal`, PTY works
4. `cd server && bunx tsc --noEmit` — type-checking passes
