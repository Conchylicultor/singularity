# Plugin Core

Framework for Singularity's plugin system. Every feature is a plugin — including the app shell.

## Concepts

There are only two primitives: **slots** and **contributions**.

- A **slot** is a typed extension point defined by a plugin. It declares the shape of data it accepts.
- A **contribution** is an entry a plugin provides to another plugin's slot.

Plugins never import from each other's internals. They only import **slot definitions** (which are lightweight typed factories).

## How It Works

### Defining a slot

A slot is created with `defineSlot<P>(id)`. It returns an object that is both:

1. **A factory** — call it with props to create a contribution: `MySlot({ title: "Hello", component: Hello })`
2. **A hook** — call `.useContributions()` inside React to get all contributions targeting this slot

```typescript
import { defineSlot } from "@core";

export const MyPlugin = {
  Panel: defineSlot<{ title: string; component: ComponentType }>("myplugin.panel"),
};
```

### Creating a plugin

A plugin is a `PluginDefinition` — just `{ id, name, contributions? }`:

```typescript
import { type PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";

const myPlugin: PluginDefinition = {
  id: "my-plugin",
  name: "My Plugin",
  contributions: [
    Shell.Sidebar({ title: "My Panel", icon: MyIcon, component: MyPanel }),
  ],
};
export default myPlugin;
```

### Rendering contributions

The plugin that defines a slot is responsible for rendering its contributions:

```typescript
function MyLayout() {
  const panels = MyPlugin.Panel.useContributions();
  return panels.map((p) => <p.component key={p.title} />);
}
```

### Registering a plugin

Add it to `web/src/plugins.ts`:

```typescript
import myPlugin from "@plugins/my-plugin/web";
export const plugins: PluginDefinition[] = [shellPlugin, myPlugin];
```

## Bootstrap Flow

1. `web/src/main.tsx` renders `App`
2. `App` wraps everything in `<PluginProvider plugins={plugins}>` which collects all contributions from all plugins into React context
3. `App` renders `<RootRenderer>` which renders all `Core.Root` contributions
4. The shell plugin contributes its `ShellLayout` to `Core.Root` — this is the app's main layout
5. `ShellLayout` calls `Shell.Sidebar.useContributions()`, `Shell.Main.useContributions()`, etc. to render whatever other plugins contributed

## Commands

Commands are typed, imperative, request-response actions between plugins. A command has one provider (handler) and any number of consumers (dispatchers).

A command is created with `defineCommand<Args, Return>(id)`. The returned object is **callable** — calling it dispatches to the registered handler. It also exposes `.useHandler(fn)` for the provider to register the implementation.

### Defining a command

```typescript
import { defineCommand } from "@core";

export const Shell = {
  Toast: defineCommand<ToastArgs, void>("shell.toast"),
};
```

### Handling a command (provider)

Call `.useHandler(fn)` inside a mounted React component. The handler typically closes over React state:

```typescript
Shell.Toast.useHandler((args) => {
  showToast(args);
});
```

### Dispatching a command (consumer)

Call the command directly — no hook needed:

```typescript
import { ShellCommands } from "@plugins/shell/web";

<button onClick={() => ShellCommands.Toast({ description: "Saved" })}>Save</button>
```

### Panes: use `Pane.define`, not commands

For opening a view or mounting a URL, use the `pane` plugin (`@plugins/primitives/plugins/pane/web`) — not a command. `Pane.define` declares a pane (path, component, typed params); `Pane.Register` contributes it to the router. See [`plugins/primitives/plugins/pane/CLAUDE.md`](../plugins/primitives/plugins/pane/CLAUDE.md).

```typescript
// plugins/terminal/web/panes.ts
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { TerminalComponent } from "./components/terminal";

export const terminalPane = Pane.define({
  id: "terminal",
  path: "/terminal/:worktree",
  component: () => {
    const { worktree } = terminalPane.useParams();
    return <TerminalComponent worktree={worktree} />;
  },
});

// plugins/terminal/web/index.ts
export default {
  id: "terminal",
  contributions: [Pane.Register({ pane: terminalPane })],
} satisfies PluginDefinition;

// Consumer:
<button onClick={() => terminalPane.open({ worktree: path })}>Launch</button>
```

## Live state, networking, editable fields

`@core` is the **framework** only — slots, commands, contributions, plugin context, and the `PluginDefinition` type. Cross-cutting client-side primitives live as plugins under [`plugins/primitives/`](../plugins/primitives/):

- `<PluginErrorBoundary>`, `ErrorBoundary.Action`, `registerBoundaryReporter` → `@plugins/primitives/plugins/error-boundary/web`
- `useResource`, `NotificationsProvider`, `resourceDescriptor` → `@plugins/primitives/plugins/live-state/web` (and `…/core` or `…/shared` for resource declarations)
- `useReconnectingWebSocket`, `ReconnectingEventSource`, `SharedWebSocket`, `fetchWithRetry`, `subscribeWsStatus` → `@plugins/primitives/plugins/networking/web`
- `useEditableField` → `@plugins/primitives/plugins/editable-field/web`

Raw `new EventSource(...)` in plugins is forbidden — use `ReconnectingEventSource` from the networking sub-plugin when consuming the gateway's external log SSE endpoint.

## File Structure

```
plugins/
├── framework/plugins/web-sdk/   # This package — framework primitives
│   ├── core/                    # Public API (importable via @core)
│   │   ├── index.ts             # Barrel export
│   │   ├── types.ts             # PluginDefinition, Contribution
│   │   ├── slots.ts             # defineSlot(), Slot<P>, Core.Root
│   │   ├── commands.ts          # defineCommand()
│   │   ├── context.tsx          # PluginProvider, PluginRuntimeContext
│   │   └── loader.ts            # loadPlugins()
│   └── shared/                  # Private (topo sort)
│       └── topo.ts
├──
└── {plugin-name}/
    ├── web/              # Frontend code (compiled by web tsconfig)
    │   ├── index.ts      # Default export: PluginDefinition
    │   ├── slots.ts      # Optional: slots this plugin defines for others to extend
    │   ├── commands.ts   # Optional: commands this plugin handles
    │   ├── views.tsx     # Optional: view factories returning descriptor for commands
    │   └── components/   # Internal React components (never imported by other plugins)
    ├── server/           # Backend code (compiled by server tsconfig)
    │   ├── index.ts      # Default export: ServerPluginDefinition; named exports are the public API for other plugins
    │   └── internal/     # Handler implementations, business logic (never imported externally)
    ├── core/             # Public API — types/utils importable cross-plugin (@plugins/foo/core)
    │   └── index.ts      # Barrel re-exporting public types and values
    ├── shared/           # Private DRY — shared between web/server within this plugin only (intra-plugin @plugins/foo/shared)
    │   └── protocol.ts   # e.g. WebSocket message types, resource descriptors
    └── scripts/          # Standalone entry points invoked outside the server/web build
        └── start.ts      # e.g. DB lifecycle, future: server bootstrap, CLI entry points

web/src/
├── plugins.ts            # Hardcoded plugin registry (static imports)
└── App.tsx               # PluginProvider + RootRenderer
```

## Path Aliases

Configured in `web/vite.config.ts` and `web/tsconfig.app.json`:

- `@core` → `plugins/framework/plugins/web-sdk/core/`
- `@plugins/*` → `plugins/*/`
- `@/*` → `web/src/*`

## The Shell Plugin

`plugins/shell/web/` is the foundational plugin. It contributes to `Core.Root` and defines the standard layout slots:

- `Shell.Sidebar` — `{ title, icon, component }`
- `Shell.Main` — `{ title, component }`
- `Shell.Toolbar` — `{ label, icon, onClick }`

Empty regions are not rendered (collapsed). Most plugins will contribute to these Shell slots.

## Adding a New Plugin

1. Create `plugins/{name}/web/index.ts`
2. Import slots from the plugins you want to extend (e.g., `Shell` from `@plugins/shell/web`)
3. Export a default `PluginDefinition` with contributions
4. Register it in `web/src/plugins.ts`
5. Optionally define your own slots in `plugins/{name}/web/slots.ts` for other plugins to extend

## Styling

The app uses **Tailwind CSS v4** with **shadcn/ui** components. Theme tokens are defined in `web/src/app.css` using CSS variables.

**All plugins must follow the styling guide: [`docs/styling.md`](docs/styling.md).** It covers colors, typography, spacing, component usage, and things to avoid. Read it before writing any UI code.

### Quick reference

- **Components**: Import shadcn from `@/components/ui/*`. Install new ones with `bunx shadcn@latest add <name>` from `web/`.
- **Colors**: Semantic tokens only (`bg-background`, `text-muted-foreground`, etc.) — never hardcode.
- **Icons**: `react-icons/md` — Material Design, accepts `{ className?: string }`.
- **Conditional classes**: Use `cn()` from `@/lib/utils`, not template literals.

### External dependencies

The project uses bun workspaces. Shared dependencies (react, react-icons, lucide-react, types) are declared in the root `package.json` and available to all workspaces. Plugin-specific dependencies (e.g., `sonner` for the shell plugin, `@xterm/*` for the terminal plugin) are declared in that plugin's own `package.json`. Run `bun install` from the repo root.

## Umbrella Plugins

An umbrella is a grouping shell that nests related sub-plugins under `plugins/`. It needs only:

- `package.json` with a `"description"` field for documentation
- `plugins/` subdirectory with child plugins
- `CLAUDE.md` (auto-generated by `./singularity build`)

No `web/index.ts` or `server/index.ts` required unless the umbrella itself has contributions, exports, or routes. The plugin-tree builder reads `singularity.description` from `package.json` as a fallback when no runtime barrel exists.

## Key Design Decisions

- **Per-plugin error isolation (web)** — web plugins use dynamic `import()` for per-plugin error isolation; server/central use static imports. All plugins are known at build time (the generated registry lists them)
- **No dependencies field** — import statements enforce dependency at build time
- **No lifecycle hooks** — plugins use React's own lifecycle (useEffect, etc.)
- **Slots are the only extension mechanism** — no special `root`, `background`, or other fields
- **Inter-plugin communication** — `defineCommand` for imperative request-response actions; view factories for passing components across plugin boundaries without leaking internals

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Web plugin runtime: slots, commands, contributions, loader
- Exports (core):
  - Types: `Contribution`, `DocMeta`, `PluginDefinition`, `PluginEntry`, `PluginId`, `PluginLoadError`, `Slot`
  - Values: `Core`, `defineCommand`, `defineSlot`, `loadPlugins`, `PluginProvider`, `PluginRuntimeContext`
- Exports (shared):
  - Values: `topoSortPlugins`

<!-- AUTOGENERATED:END -->
