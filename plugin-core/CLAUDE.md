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
import { Shell } from "@plugins/shell/web/slots";

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
  OpenPane: defineCommand<PaneDescriptor, string>("shell.open-pane"),
};
```

### Handling a command (provider)

Call `.useHandler(fn)` inside a mounted React component. The handler typically closes over React state:

```typescript
Shell.OpenPane.useHandler((descriptor) => {
  const id = ...;
  setPanels((prev) => { id, descriptor });
  return id;
});
```

### Dispatching a command (consumer)

Call the command directly — no hook needed:

```typescript
import { Shell } from "@plugins/shell/web/commands";

<button onClick={() => Shell.OpenPane({ title: "Hello", component: MyView })}>Open</button>
```

### View factories

When a command accepts a component (like `Shell.OpenPane`), plugins should expose **factory functions** rather than raw components. This preserves encapsulation — consumers never import internal components:

```typescript
// plugins/terminal/web/views.ts (public API)
import { TerminalComponent } from "./components/terminal"; // internal

export function terminalPane(args: { worktree: string }): PaneDescriptor {
  const Component = () => <TerminalComponent worktree={args.worktree} />;
  return { title: `Agent: ${args.worktree}`, component: Component };
}
```

Consumer composes factory + command:

```typescript
import { Shell } from "@plugins/shell/web/commands";
import { terminalPane } from "@plugins/terminal/web/views";

<button onClick={() => Shell.OpenPane(terminalPane({ worktree: path }))}>Launch</button>
```

## File Structure

```
plugin-core/              # This package — framework primitives
├── types.ts              # PluginDefinition, Contribution
├── slots.ts              # defineSlot(), Slot<P>, Core.Root
├── commands.ts           # defineCommand()
├── context.tsx           # PluginProvider, PluginRuntimeContext
└── index.ts              # Barrel export

plugins/
└── {plugin-name}/
    ├── web/              # Frontend code (compiled by web tsconfig)
    │   ├── index.ts      # Default export: PluginDefinition
    │   ├── slots.ts      # Optional: slots this plugin defines for others to extend
    │   ├── commands.ts   # Optional: commands this plugin handles
    │   ├── views.tsx     # Optional: view factories returning descriptor for commands
    │   └── components/   # Internal React components (never imported by other plugins)
    ├── server/           # Backend code (compiled by server tsconfig)
    │   ├── index.ts      # Default export: ServerPluginDefinition (routes declared here)
    │   ├── api.ts        # Optional: public API for other plugins to import
    │   └── internal/     # Handler implementations, business logic (never imported externally)
    └── shared/           # Types shared between web and server
        └── protocol.ts   # e.g. WebSocket message types

web/src/
├── plugins.ts            # Hardcoded plugin registry (static imports)
└── App.tsx               # PluginProvider + RootRenderer
```

## Path Aliases

Configured in `web/vite.config.ts` and `web/tsconfig.app.json`:

- `@core` → `plugin-core/`
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
2. Import slots from the plugins you want to extend (e.g., `Shell` from `@plugins/shell/web/slots`)
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

## Key Design Decisions

- **No dynamic loading** — plugins are statically imported, known at build time
- **No dependencies field** — import statements enforce dependency at build time
- **No lifecycle hooks** — plugins use React's own lifecycle (useEffect, etc.)
- **Slots are the only extension mechanism** — no special `root`, `background`, or other fields
- **Inter-plugin communication** — `defineCommand` for imperative request-response actions; view factories for passing components across plugin boundaries without leaking internals
