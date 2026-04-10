# Server

Shared backend for Singularity. A single Bun process that routes HTTP requests and WebSocket connections to handlers provided by plugins.

See the top-level [`CLAUDE.md`](../CLAUDE.md) for overall architecture and [`plugin-core/CLAUDE.md`](../plugin-core/CLAUDE.md) for the frontend plugin system.

## How It Works

1. `src/index.ts` starts `Bun.serve()` on port 9001
2. Each plugin declares its routes via a `ServerPluginDefinition` (defined in `src/types.ts`)
3. `src/plugins.ts` is a flat list of plugin imports — structurally identical to `web/src/plugins.ts`
4. At startup, the entry point flattens all plugin routes into two lookup tables:
   - `httpRoutes` — `"METHOD /path"` → handler function
   - `wsRoutes` — `"/path"` → `WsHandler` object (open/message/close)

## File Structure

```
server/
├── package.json          # @singularity/server
├── tsconfig.json
└── src/
    ├── index.ts          # Bun.serve entry — collects routes from plugins
    ├── plugins.ts        # Plugin registry (list of imports)
    └── types.ts          # ServerPluginDefinition, WsHandler, HttpHandler
```

## ServerPluginDefinition

Each server plugin default-exports a `ServerPluginDefinition`:

```typescript
import type { ServerPluginDefinition } from "../../../server/src/types";
import { wsHandler } from "./internal/ws-handler";

const plugin: ServerPluginDefinition = {
  id: "terminal",
  name: "Terminal",
  wsRoutes: {
    "/ws/terminal": wsHandler,
  },
};
export default plugin;
```

The type is intentionally flat — no base classes, no lifecycle hooks. A plugin is just a data object with optional route maps.

### WsHandler Interface

WebSocket handlers match Bun's native interface:

```typescript
interface WsHandler {
  open(ws: ServerWebSocket<WsData>): void;
  message(ws: ServerWebSocket<WsData>, msg: string | Buffer): void;
  close(ws: ServerWebSocket<WsData>, code: number, reason: string): void;
}
```

### HTTP Handlers

Plain functions: `(req: Request) => Response | Promise<Response>`. No wrapper types needed — these are standard Web API types.

## Adding a Plugin's Server Component

1. Create the plugin directory with this structure:

```
plugins/{name}/server/
  index.ts        # Default export: ServerPluginDefinition (routes declared here)
  api.ts          # Optional: public API for other plugins to import
  internal/       # Handler implementations, business logic (never imported externally)
```

2. Declare routes in `index.ts`:

```typescript
import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleList } from "./internal/handle-list";

const plugin: ServerPluginDefinition = {
  id: "tasks",
  name: "Tasks",
  httpRoutes: {
    "GET /api/tasks": handleList,
  },
};
export default plugin;
```

3. Register in `server/src/plugins.ts`:

```typescript
import tasksPlugin from "@plugins/tasks/server";

export const plugins: ServerPluginDefinition[] = [
  // ...existing plugins
  tasksPlugin,
];
```

That's it. No base class, no setup function, no registration ceremony.

## Path Aliases

Configured in `tsconfig.json`:

- `@plugins/*` → `../plugins/*/`

The `include` field covers `../plugins/*/server` and `../plugins/*/shared` so plugin server code and shared types are type-checked together with the server.

Server-side plugin dependencies (like `bun-pty`) are declared in the plugin's own `package.json` and resolved via bun workspaces. No path aliases are needed for third-party packages.

## Dev Proxy

The Vite dev server (`web/vite.config.ts`) proxies to the backend:

- `/ws/*` → `ws://localhost:9001` (WebSocket)
- `/api/*` → `http://localhost:9001` (HTTP)

In production, a reverse proxy or the backend itself serves the static frontend.

## Commands

```sh
bun install   # Install dependencies
bun dev       # Start with --watch (auto-restart on changes)
bun start     # Start without watch
```

## Key Design Decisions

- **Plugins own their routes** — each plugin declares routes in its `ServerPluginDefinition`, not in a central file
- **No middleware** — plugins own their paths entirely; shared concerns (auth, logging) can be added as utilities later
- **No dynamic route matching** — exact path match only; plugins parse sub-paths from the URL themselves
- **Internal/public separation** — `index.ts` and `api.ts` are public; `internal/` is never imported by other plugins
- **Plugin dependencies go in their own `package.json`** — resolved via bun workspaces
- **Bun runs TypeScript directly** — no build step needed
