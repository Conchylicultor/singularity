# Server-Side Inter-Plugin Communication

## Context

The backend has no inter-plugin communication. Plugins register HTTP/WS handlers but cannot talk to each other. We need a typed pub/sub primitive so plugins can communicate, and a logs service built on top for persistent, streamable event capture.

## Two layers

This mirrors the frontend architecture:

| | Frontend | Backend |
|---|---|---|
| **Generic primitive** | `defineSlot` / `defineCommand` in `plugin-core/` | `defineChannel` in `server/src/` |
| **Service plugin** | `Shell.Sidebar` in `plugins/shell/web/slots.ts` | `Log.channel` in `plugins/logs/server/api.ts` |

The primitive is framework. The service is a plugin that uses the framework to offer a specific capability.

---

## Layer 1: `defineChannel<T>` — server primitive

Pure typed pub/sub. No history, no persistence. The server-side equivalent of `defineCommand`.

```typescript
// server/src/channels.ts

export interface Channel<T> {
  readonly id: string;
  publish(event: T): void;
  subscribe(fn: (event: T) => void): () => void;
}

export function defineChannel<T>(id: string): Channel<T>;
```

**When to use directly**: Plugin-to-plugin events where persistence is not needed. E.g. a "build.status-changed" event that other plugins react to in real time.

### Implementation (~20 lines)

```typescript
const channels = new Map<string, Channel<unknown>>();

export function defineChannel<T>(id: string): Channel<T> {
  if (channels.has(id)) throw new Error(`Channel "${id}" already defined`);

  const listeners = new Set<(event: T) => void>();

  const channel: Channel<T> = {
    id,
    publish(event: T) {
      for (const fn of listeners) fn(event);
    },
    subscribe(fn: (event: T) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  channels.set(id, channel);
  return channel;
}
```

---

## Layer 2: Logs service — plugin

The logs plugin uses `defineChannel` internally and layers on log-specific behavior: history buffering and WS streaming to the frontend.

**Dependency direction**: `build → logs → defineChannel`. Build imports from logs. Logs never knows about build.

### Public API

```typescript
// plugins/logs/server/api.ts

export interface LogChannel<T> {
  publish(event: T): void;
}

export const Log = {
  channel<T>(id: string): LogChannel<T>,
};
```

A producer only sees `publish`. History, buffering, and WS streaming are internal to the logs plugin — the producer doesn't know or care.

### Producer usage

```typescript
// plugins/build/server/api.ts
import { Log } from "@plugins/logs/server/api";

export const buildLog = Log.channel<string>("build");
```

```typescript
// plugins/build/server/index.ts
import { buildLog } from "./api";

export async function handleBuild(req: Request) {
  buildLog.publish("compiling...");
  // ...
  buildLog.publish("done");
  return new Response("ok");
}
```

### Internal implementation

```typescript
// plugins/logs/server/api.ts
import { defineChannel, type Channel } from "@singularity/server/channels";

interface LogEntry<T> {
  event: T;
  timestamp: number;
}

interface InternalLogChannel<T> {
  channel: Channel<LogEntry<T>>;
  history: LogEntry<T>[];
}

const registry = new Map<string, InternalLogChannel<unknown>>();
const MAX_HISTORY = 10_000;

export interface LogChannel<T> {
  publish(event: T): void;
}

export const Log = {
  channel<T>(id: string): LogChannel<T> {
    const ch = defineChannel<LogEntry<T>>(`log.${id}`);
    const history: LogEntry<T>[] = [];

    ch.subscribe((entry) => {
      history.push(entry);
      if (history.length > MAX_HISTORY) history.shift();
    });

    registry.set(id, ch as unknown as InternalLogChannel<unknown>);

    return {
      publish(event: T) {
        ch.publish({ event, timestamp: Date.now() });
      },
    };
  },
};

// Internal — used by the WS handler, not exported from api.ts
export function getLogChannel(id: string) { return registry.get(id); }
export function getLogChannelIds() { return [...registry.keys()]; }
```

The logs plugin adds `timestamp` internally — producers don't pass it.

### WS handler

```typescript
// plugins/logs/server/index.ts
// Bridges log channels to the frontend via /ws/logs
```

Protocol in `plugins/logs/shared/protocol.ts`:

```typescript
// Client -> Server
type LogClientMessage =
  | { type: "subscribe"; channels: string[] }
  | { type: "unsubscribe"; channels: string[] };

// Server -> Client
type LogServerMessage =
  | { type: "history"; channel: string; entries: { event: unknown; timestamp: number }[] }
  | { type: "event"; channel: string; entry: { event: unknown; timestamp: number } }
  | { type: "error"; message: string };
```

On subscribe: send `history` message (full buffer), then forward live events as `event` messages. On WS close: clean up all subscriptions.

---

## Convention: `api.ts`

Every plugin's server component separates public API from internals:

```
plugins/{name}/server/
  api.ts       # Public surface. Other plugins import from here.
  index.ts     # Handlers, business logic. Never imported by other plugins.
```

This mirrors the frontend pattern where `slots.ts` / `commands.ts` are public, and `components/` is internal.

---

## Files

### New

| File | Purpose |
|------|---------|
| `server/src/channels.ts` | `defineChannel<T>` primitive (~20 lines) |
| `plugins/logs/package.json` | Workspace package |
| `plugins/logs/server/api.ts` | `Log.channel<T>` public API |
| `plugins/logs/server/index.ts` | WS handler for `/ws/logs` |
| `plugins/logs/shared/protocol.ts` | WS message types |

### Modified

| File | Change |
|------|--------|
| `server/src/plugins.ts` | Add `/ws/logs` route |
| `package.json` (root) | Add `plugins/logs` to workspaces |

---

## Verification

1. Create `server/src/channels.ts`, verify: define a channel, publish/subscribe works, duplicate ID throws
2. Create logs plugin, verify: `Log.channel` returns a `LogChannel`, publishing buffers with timestamp, history caps at limit
3. WS: connect to `/ws/logs`, subscribe to a channel, verify history replay then live events
4. End-to-end: HTTP endpoint publishes → WS client receives
