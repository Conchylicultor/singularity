# Server-Side Inter-Plugin Communication

## Context

The backend has no inter-plugin communication. Plugins register HTTP/WS handlers but cannot call each other. We need a convention for plugins to expose typed server-side APIs, and a logs plugin as the first service built on this convention.

## Design

### No new primitive

The frontend needs `defineSlot` / `defineCommand` because React's lifecycle requires registration hooks. The server has no such constraint — plugins can just export typed functions and objects. The "framework" is a file convention.

### Convention: `api.ts`

Every plugin's server component separates its public surface from internals:

```
plugins/{name}/server/
  api.ts       # Public typed API. Other plugins import from here.
  index.ts     # Handlers, business logic. Never imported by other plugins.
```

This mirrors the frontend where `slots.ts` / `commands.ts` are public and `components/` is internal.

A plugin's `api.ts` can expose whatever makes sense — functions, objects, factories. No shared base type.

### Update `server/CLAUDE.md`

Document the `api.ts` convention so future plugins follow it.

---

## Logs plugin

The first service plugin. Exposes `Log.channel(id)` — producers call it to get a channel, then publish string log lines to it. The logs plugin handles history internally.

### Public API

```typescript
// plugins/logs/server/api.ts

export interface LogChannel {
  publish(line: string): void;
}

export const Log = {
  channel(id: string): LogChannel,
};
```

Producers only see `publish`. Everything else is internal.

### Producer usage

```typescript
// plugins/build/server/api.ts
import { Log } from "@plugins/logs/server/api";

export const buildLog = Log.channel("build");
```

```typescript
// plugins/build/server/index.ts
import { buildLog } from "./api";

export async function handleBuild(req: Request) {
  buildLog.publish("compiling...");
  return new Response("ok");
}
```

### Internal implementation

```typescript
// plugins/logs/server/api.ts

interface InternalChannel {
  id: string;
  lines: string[];
  listeners: Set<(line: string) => void>;
}

const registry = new Map<string, InternalChannel>();
const MAX_HISTORY = 10_000;

export interface LogChannel {
  publish(line: string): void;
}

export const Log = {
  channel(id: string): LogChannel {
    if (registry.has(id)) throw new Error(`Log channel "${id}" already exists`);

    const internal: InternalChannel = {
      id,
      lines: [],
      listeners: new Set(),
    };
    registry.set(id, internal);

    return {
      publish(line: string) {
        internal.lines.push(line);
        if (internal.lines.length > MAX_HISTORY) internal.lines.shift();
        for (const fn of internal.listeners) fn(line);
      },
    };
  },
};
```

The `listeners` set is kept for future WS streaming — not exposed in the public API.

---

## Files

### New

| File | Purpose |
|------|---------|
| `plugins/logs/server/api.ts` | `Log.channel(id)` public API + internal registry |

### Modified

| File | Change |
|------|--------|
| `server/CLAUDE.md` | Document `api.ts` convention |

---

## Verification

1. Create logs plugin, verify: `Log.channel` returns a `LogChannel`, duplicate ID throws
2. Publish lines, verify internal history buffers and caps at limit
