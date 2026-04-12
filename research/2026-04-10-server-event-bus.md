# Server-Side Event Bus: Log Channels

## Context

The backend has no inter-plugin communication. Plugins register HTTP/WS handlers but cannot talk to each other. We need a typed pub/sub primitive so producers (e.g. a build plugin) can emit events that infrastructure plugins (e.g. logs) can persist and stream to the frontend.

**Design principle**: The logs plugin is infrastructure — it exposes the service. Producers import from it and publish. This mirrors the frontend pattern where the shell plugin exposes slots and other plugins contribute.

## API

### `Log.defineChannel<T>(id, options?): Channel<T>`

Defined in `plugins/logs/server/channels.ts`. Module-level factory, like `defineCommand`.

```typescript
interface ChannelOptions {
  maxHistory?: number; // default 10_000
}

interface Channel<T> {
  readonly id: string;
  publish(event: T): void;
  subscribe(fn: (event: T) => void): () => void; // returns unsubscribe
  history(): T[];
}

export const Log = {
  defineChannel<T>(id: string, options?: ChannelOptions): Channel<T>,
};
```

Internally, `defineChannel` stores channels in a module-level `Map<string, Channel<unknown>>`. Throws on duplicate IDs. History is a capped array (`shift()` when over limit).

An internal `getChannel(id)` function (not exported in `Log`) is used by the WS handler to look up channels by string ID for frontend subscriptions.

### Producer usage (build plugin example)

```typescript
// plugins/build/server/index.ts
import { Log } from "@plugins/logs/server/channels";

const buildLog = Log.defineChannel<{
  line: string;
  stream: "stdout" | "stderr";
  timestamp: number;
}>("build");

export async function handleBuild(req: Request) {
  const proc = Bun.spawn(["bun", "run", "build"]);
  for await (const line of proc.stdout) {
    buildLog.publish({ line: line.toString(), stream: "stdout", timestamp: Date.now() });
  }
  return new Response("ok");
}
```

### Frontend consumption via WebSocket

The logs plugin exposes `/ws/logs`. Protocol:

```typescript
// plugins/logs/shared/protocol.ts

// Client -> Server
type LogClientMessage =
  | { type: "logs.subscribe"; channels: string[] }
  | { type: "logs.unsubscribe"; channels: string[] };

// Server -> Client
type LogServerMessage =
  | { type: "logs.history"; channel: string; events: unknown[] }
  | { type: "logs.event"; channel: string; event: unknown }
  | { type: "logs.error"; error: string };
```

**Flow:**
1. Frontend opens WS to `/ws/logs`
2. Sends `{ type: "logs.subscribe", channels: ["build"] }`
3. Server replies with `logs.history` (full buffer) for each channel
4. Server forwards live events as `logs.event`
5. On WS close, server cleans up all subscriptions for that connection

## Files

### New

| File | Purpose |
|------|---------|
| `plugins/logs/package.json` | Workspace package (`@singularity/plugin-logs`) |
| `plugins/logs/server/channels.ts` | `Log.defineChannel` factory, `Channel<T>` type |
| `plugins/logs/server/index.ts` | WS handler for `/ws/logs` — bridges channels to frontend |
| `plugins/logs/shared/protocol.ts` | `LogClientMessage`, `LogServerMessage` types |

### Modified

| File | Change |
|------|--------|
| `server/src/plugins.ts` | Add `/ws/logs` route |
| `package.json` (root) | Add `plugins/logs` to workspaces |

### Implementation notes

**`plugins/logs/server/channels.ts`** — The core primitive. ~40 lines. Module-level `channels` map. `defineChannel` creates a channel object with closure over `listeners: Set` and `buffer: T[]`. `publish` appends to buffer (trims if over max), iterates listeners. `subscribe` adds to set, returns remover. `history` returns `[...buffer]`.

**`plugins/logs/server/index.ts`** — WS handler following terminal plugin pattern. Tracks `Map<ServerWebSocket, Set<() => void>>` for cleanup. On `logs.subscribe`: calls `getChannel(id)`, sends `logs.history`, then `channel.subscribe()` forwarding as `logs.event`. On close: calls all unsubscribe functions.

**`plugins/logs/shared/protocol.ts`** — Discriminated unions, same pattern as `plugins/terminal/shared/protocol.ts`.

## Design decisions

- **No server-side `plugin-core`** — the server philosophy is "no framework." The logs plugin owns this as a service. Extract later if more primitives emerge.
- **Channels defined at module scope** — deterministic, type-safe via imports, same as `defineCommand`.
- **History as capped array** — `Array.shift()` at 10k entries is fast enough. Swap to circular buffer if profiling says otherwise.
- **History sent as single message per channel** — simpler than streaming, lets frontend distinguish "catching up" from "live."
- **Events are `unknown` over the wire** — type safety is compile-time between server plugins. Frontend defines its own matching types.
- **No backpressure** — in-process pub/sub for log-style data. Bun's WS buffering handles slow clients.

## Verification

1. Create the logs plugin files and register the WS route
2. Create a test producer (could be a simple HTTP endpoint that publishes N events)
3. Open a WS client to `/ws/logs`, subscribe to the test channel
4. Verify: history received on subscribe, live events forwarded, cleanup on disconnect
5. Verify: duplicate channel ID throws, type safety works across plugin boundary
