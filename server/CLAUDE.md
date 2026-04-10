# Server

Shared backend for Singularity. A single Bun process that routes HTTP requests and WebSocket connections to handlers provided by plugins.

See the top-level [`CLAUDE.md`](../CLAUDE.md) for overall architecture and [`plugin-core/CLAUDE.md`](../plugin-core/CLAUDE.md) for the frontend plugin system.

## Why No Framework

The frontend needs a plugin framework (slots + contributions) because multiple plugins compose UI fragments into a shared layout. The server has no equivalent problem — each plugin owns its URL paths outright. URL routing is already a natural extension mechanism, so the server is just a plain Bun app that imports handlers from plugin folders.

## How It Works

1. `src/index.ts` starts `Bun.serve()` on port 9001
2. Incoming requests are matched against two route tables defined in `src/plugins.ts`:
   - `httpRoutes` — `"METHOD /path"` → handler function
   - `wsRoutes` — `"/path"` → `WsHandler` object (open/message/close)
3. Plugins populate these tables by adding imports and entries in `src/plugins.ts`

## File Structure

```
server/
├── package.json          # @singularity/server
├── tsconfig.json
└── src/
    ├── index.ts          # Bun.serve entry — routes to plugin handlers
    └── plugins.ts        # Route tables + WsHandler type
```

## Adding a Plugin's Server Component

1. Create `plugins/{name}/server/` with:
   - `api.ts` — **public API**. Types, factories, service objects that other plugins may import. This is the only file other plugins should import from.
   - `index.ts` — **internal**. HTTP/WS handlers, business logic. Never imported by other plugins.
2. Import handlers in `server/src/plugins.ts` and add entries to the route tables:

```typescript
// server/src/plugins.ts
import { wsHandler as terminalWs } from "@plugins/terminal/server";
import { listItems } from "@plugins/tasks/server";

export const httpRoutes = {
  "GET /api/tasks": listItems,
};

export const wsRoutes = {
  "/ws/terminal": terminalWs,
};
```

That's it. No base class, no setup function, no registration ceremony.

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

- **No server-side plugin framework** — URL paths are the extension mechanism; no slots/contributions abstraction
- **No middleware** — plugins own their paths entirely; shared concerns (auth, logging) can be added as utilities later
- **No dynamic route matching** — exact path match only; plugins parse sub-paths from the URL themselves
- **Plugin dependencies go in their own `package.json`** — resolved via bun workspaces
- **Bun runs TypeScript directly** — no build step needed
