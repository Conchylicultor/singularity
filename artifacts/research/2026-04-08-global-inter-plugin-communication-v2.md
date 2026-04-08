# Inter-Plugin Communication v2 — Commands + View Factories

## Context

v1 explored four options (commands, events, shared state, services) in the abstract. This doc narrows to a single recommended design based on working through the concrete end-user API.

**Starting point:** a conversation plugin with a list of items. Clicking one should open a terminal pane in the shell's main area. The ideal end-user code:

```typescript
onClick={() => Shell.OpenPane(terminalPane({ worktree: conv.path }))}
```

This reads as: *tell the shell to open a pane, using a view the terminal plugin knows how to build*. Two concerns, two primitives.

## Design

### Primitive 1: Commands (`defineCommand`)

Typed, imperative, request-response actions between plugins. A command has one provider (handler) and any number of consumers (dispatchers).

The command itself **is** the dispatch function — no `useDispatch()` hook needed. This mirrors how `defineSlot` returns a callable that is also a factory.

```typescript
// plugin-core/commands.ts
export function defineCommand<Args, Return = void>(id: string) {
  let handler: ((args: Args) => Return) | null = null;

  return Object.assign(
    (args: Args): Return => {
      if (!handler) throw new Error(`No handler for command "${id}"`);
      return handler(args);
    },
    {
      id,
      useHandler(fn: (args: Args) => Return) {
        const ref = useRef(fn);
        ref.current = fn;
        useEffect(() => {
          handler = (args) => ref.current(args);
          return () => { handler = null; };
        }, []);
      },
    },
  );
}
```

- **Dispatch:** call the command directly — `Shell.OpenPane(descriptor)`. No hook, works anywhere (event handlers, callbacks, etc.).
- **Handle:** call `.useHandler(fn)` inside a mounted React component. This is a hook because the handler typically closes over React state (e.g. `setPanels`). `useEffect` ensures cleanup on unmount.
- **Storage:** module-level closure variable. No React context needed for commands — unlike slots, commands don't need to be collected across plugins.

**~20 lines in plugin-core. No changes to `context.tsx`.**

**Parallels with slots:**
| Slots (static) | Commands (imperative) |
|---|---|
| `defineSlot<P>(id)` | `defineCommand<Args, Return>(id)` |
| `slots.ts` — public API | `commands.ts` — public API |
| `Shell.Sidebar({ ... })` → contribution | `Shell.OpenPane({ ... })` → dispatch |
| `.useContributions()` → read all | `.useHandler(fn)` → register |

### Primitive 2: View Factories (pattern, not a primitive)

**Problem with naive approach:**

```typescript
// ❌ Leaks terminal internals — consumer imports TerminalComponent
openPane({ component: TerminalComponent, props: { worktree } })

// ❌ No type safety — how does TS know props match component?
defineCommand<{ component: ComponentType<any>, props: any }, string>()
```

**Solution:** the plugin that owns the component exposes a **factory function** that returns an opaque `PaneDescriptor`. The factory captures the component in a closure — consumers never see it.

```typescript
// Protocol — defined by the shell (what OpenPane accepts)
interface PaneDescriptor {
  title: string;
  component: ComponentType;  // no props — fully bound
}
```

`component` takes **zero props**. Everything is captured inside. This means:
- No generic `<P>` at the command boundary
- No `any` anywhere
- Type safety is fully local to each plugin

### How It Fits Together

**Shell plugin** defines the command:

```typescript
// plugins/shell/web/commands.ts
import { defineCommand } from "@core";
import type { ComponentType } from "react";

export interface PaneDescriptor {
  title: string;
  component: ComponentType;
}

export const Shell = {
  OpenPane: defineCommand<PaneDescriptor, string>("shell.open-pane"),
};
```

**Shell plugin** handles it (internal — manages dynamic panel state):

```typescript
// plugins/shell/web/components/shell-layout.tsx (inside component)
const [panels, setPanels] = useState<Array<{ id: string } & PaneDescriptor>>([]);

Shell.OpenPane.useHandler((descriptor) => {
  const id = crypto.randomUUID();
  setPanels((prev) => [...prev, { id, ...descriptor }]);
  return id;
});

// Render:
{panels.map((panel) => (
  <panel.component key={panel.id} />
))}
```

**Terminal plugin** exposes a factory:

```typescript
// plugins/terminal/web/views.tsx (public API)
import type { PaneDescriptor } from "@plugins/shell/web/commands";
import { TerminalComponent } from "./components/terminal"; // internal

export function terminalPane(args: { worktree: string }): PaneDescriptor {
  const Component = () => <TerminalComponent worktree={args.worktree} />;
  return {
    title: `Agent: ${path.basename(args.worktree)}`,
    component: Component,
  };
}
```

**Consumer plugin** composes both:

```typescript
// plugins/conversations/web/components/conversation-item.tsx
import { Shell } from "@plugins/shell/web/commands";
import { terminalPane } from "@plugins/terminal/web/views";

function ConversationItem({ conv }: { conv: Conversation }) {
  return (
    <button onClick={() => Shell.OpenPane(terminalPane({ worktree: conv.path }))}>
      {conv.name}
    </button>
  );
}
```

### Type Safety Flow

Each boundary is fully typed, no `any` crosses a boundary:

```
Consumer                     Terminal factory              Shell handler
─────────────────────────────────────────────────────────────────────────
terminalPane({ worktree })   TS checks: { worktree: string } ✓
                             ↓
                             TerminalComponent worktree=   TS checks: props match ✓
                             ↓
                             returns PaneDescriptor        TS checks: { title, component } ✓
                             ↓
Shell.OpenPane(descriptor)   TS checks: PaneDescriptor ✓
                             ↓
                             Shell renders <panel.component/>  ComponentType<{}> ✓
```

### Encapsulation

```
plugins/terminal/web/
├── views.tsx         ← public: view factory (uses JSX to bind internal components)
├── commands.ts       ← public: commands this plugin handles (if any)
├── slots.ts          ← public: slots this plugin defines (if any)
└── components/       ← private: never imported by other plugins
    └── terminal.tsx     (captured in closure by views.ts)
```

The consumer imports `terminalPane` — a plain function. It never imports, references, or knows about `TerminalComponent`.

## Plugin Public API Surface

Each plugin can expose up to three public API files. All are optional:

| File | Purpose | Primitive |
|---|---|---|
| `slots.ts` | Static extension points for others to contribute to | `defineSlot` |
| `commands.ts` | Imperative actions this plugin handles | `defineCommand` |
| `views.tsx` | View factories returning `PaneDescriptor` | Plain functions (`.tsx` because they use JSX) |

## Changes to plugin-core

| File | Change |
|---|---|
| `plugin-core/commands.ts` | **New** — `defineCommand` implementation (~20 lines) |
| `plugin-core/index.ts` | Export `defineCommand` |
| `plugin-core/CLAUDE.md` | Document commands and view factory pattern |

`context.tsx` is **unchanged** — commands use module-level storage, not React context.

No other new primitives. View factories are plain functions — no framework support needed.

## What This Doesn't Cover

- **Dynamic panel management** (tabs, focus, close, split views) — separate design doc. `Shell.OpenPane` is the entry point; the shell's internal panel state management is its own concern.
- **Broadcast / 1:N events** — not needed yet. If a use case arises, `defineEvent` can be added alongside commands (they're complementary, not competing).
- **Panel persistence across page refresh** — future concern, tied to session persistence.

## Verification

1. Add `defineCommand` to plugin-core, update context
2. Add `Shell.OpenPane` command to shell plugin
3. Shell layout handles the command, manages panel state, renders dynamic panels
4. Create a minimal test: a plugin with a button that calls `openPane(somePaneFactory(args))`
5. Click button → new panel appears in main area with correct content
6. Multiple clicks → multiple panels, each with independent state
