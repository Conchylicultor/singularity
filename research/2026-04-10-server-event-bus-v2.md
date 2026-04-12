# Server-Side Event Bus: Typed Channels

## Context

The backend has no inter-plugin communication. Plugins register HTTP/WS handlers but cannot talk to each other. We need a typed pub/sub primitive so plugins can emit events that other plugins can persist, transform, or stream to the frontend.

This is a **generic server-side primitive** — not specific to logs. Any plugin can define a channel and any plugin can subscribe to it.

## Primitive: `defineChannel<T>(id)`

A channel is a typed, session-scoped event stream. One plugin defines it, any plugin can publish or subscribe.

```typescript
// server/src/channels.ts — the primitive

interface Channel<T> {
  readonly id: string;
  publish(event: T): void;
  subscribe(fn: (event: T) => void): () => void; // returns unsubscribe
  history(): T[];
}

function defineChannel<T>(id: string): Channel<T>;
```

Lives in `server/src/channels.ts` — a server primitive, same level as `server/src/plugins.ts`. Not inside any plugin.

### How plugins use it

A plugin that owns a channel exports its definition from a public API file:

```typescript
// plugins/build/server/api.ts — public API, importable by other plugins
import { defineChannel } from "@singularity/server/channels";

export const Build = {
  Log: defineChannel<string>("build.log"),
};
```

The producer publishes (typically in the same plugin):

```typescript
// plugins/build/server/index.ts — internal
import { Build } from "./api";

export async function handleBuild(req: Request) {
  const proc = Bun.spawn(["bun", "run", "build"]);
  for await (const chunk of proc.stdout) {
    Build.Log.publish(chunk.toString());
  }
  return new Response("ok");
}
```

A consumer subscribes (different plugin):

```typescript
// plugins/logs/server/index.ts
import { Build } from "@plugins/build/server/api";

// Forward build logs to WS clients
Build.Log.subscribe((line) => {
  for (const ws of subscribers) {
    ws.send(JSON.stringify({ channel: "build.log", event: line }));
  }
});
```

### Convention: `api.ts` as public surface

Each plugin's server code separates public API from internals:

```
plugins/{name}/server/
  api.ts       # Public: channel definitions, types. Other plugins import this.
  index.ts     # Internal: handlers, business logic. Never imported by other plugins.
```

This mirrors how frontend plugins separate `slots.ts` / `commands.ts` (public) from `components/` (internal).

## Design decisions

- **Generic primitive, not log-specific** — `defineChannel` lives in `server/src/`, not inside a logs plugin. Any plugin can define channels for any purpose.
- **Channel type is minimal** — `string` is fine for log lines. The producer decides the type. No invented fields (stdout/stderr, timestamps) unless the producer actually needs them.
- **`api.ts` convention** — public surface is one file, clearly separated from internals. Same pattern the frontend uses with `slots.ts` and `commands.ts`.
- **Channels are module-level singletons** — defined at import time, keyed by ID. Duplicate IDs throw.
- **History is a capped array** — default 10,000 entries. `shift()` on overflow. Simple and sufficient.

## Files

### New

| File | Purpose |
|------|---------|
| `server/src/channels.ts` | `defineChannel<T>(id)` primitive, `Channel<T>` type |

### Modified

| File | Change |
|------|--------|
| `server/src/index.ts` | Export or re-export if needed for package resolution |

### Future (not in this PR)

The logs plugin, build plugin, and WS bridge to the frontend are consumers of this primitive. They'll be built separately using `defineChannel` as the foundation.

## Implementation detail

```typescript
// server/src/channels.ts

const channels = new Map<string, Channel<unknown>>();

export interface Channel<T> {
  readonly id: string;
  publish(event: T): void;
  subscribe(fn: (event: T) => void): () => void;
  history(): T[];
}

interface ChannelOptions {
  maxHistory?: number;
}

export function defineChannel<T>(id: string, options?: ChannelOptions): Channel<T> {
  if (channels.has(id)) throw new Error(`Channel "${id}" already defined`);

  const maxHistory = options?.maxHistory ?? 10_000;
  const buffer: T[] = [];
  const listeners = new Set<(event: T) => void>();

  const channel: Channel<T> = {
    id,
    publish(event: T) {
      buffer.push(event);
      if (buffer.length > maxHistory) buffer.shift();
      for (const fn of listeners) fn(event);
    },
    subscribe(fn: (event: T) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    history() {
      return [...buffer];
    },
  };

  channels.set(id, channel);
  return channel;
}
```

~30 lines. No dependencies.

## Verification

1. Create `server/src/channels.ts`
2. Write a test: define a channel, publish events, verify `history()` returns them, verify `subscribe` receives live events
3. Verify duplicate ID throws
4. Verify history cap works
