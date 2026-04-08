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

## File Structure

```
plugin-core/              # This package — framework primitives
├── types.ts              # PluginDefinition, Contribution
├── slots.ts              # defineSlot(), Slot<P>, Core.Root
├── context.tsx           # PluginProvider, PluginRuntimeContext
└── index.ts              # Barrel export

plugins/
└── {plugin-name}/
    └── web/
        ├── index.ts      # Default export: PluginDefinition
        ├── slots.ts      # Optional: slots this plugin defines for others to extend
        └── components/   # React components

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
- `Shell.StatusBar` — `{ component }`

Empty regions are not rendered (collapsed). Most plugins will contribute to these Shell slots.

## Adding a New Plugin

1. Create `plugins/{name}/web/index.ts`
2. Import slots from the plugins you want to extend (e.g., `Shell` from `@plugins/shell/web/slots`)
3. Export a default `PluginDefinition` with contributions
4. Register it in `web/src/plugins.ts`
5. Optionally define your own slots in `plugins/{name}/web/slots.ts` for other plugins to extend

## Key Design Decisions

- **No dynamic loading** — plugins are statically imported, known at build time
- **No dependencies field** — import statements enforce dependency at build time
- **No lifecycle hooks** — plugins use React's own lifecycle (useEffect, etc.)
- **Slots are the only extension mechanism** — no special `root`, `background`, or other fields
- **Inter-plugin communication** — not yet designed; will be added when concrete use cases arise
