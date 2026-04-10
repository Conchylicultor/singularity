# Plugin Error Resilience

## Context

A crashing plugin component (e.g. the worktree-switcher dropdown) blanks the entire app because there are no React error boundaries anywhere. There is also no test infrastructure to catch render crashes before deploy.

**Goal:** (1) a crashing plugin shows an inline error instead of killing the page, and (2) a smoke test catches render crashes at build time.

## Part 1: Error Boundary in plugin-core

### New file: `plugin-core/error-boundary.tsx`

A class component (React requires class components for error boundaries) exported as `PluginErrorBoundary`.

```tsx
interface Props {
  slot?: string;     // e.g. "shell.sidebar" — shown in error UI
  label?: string;    // e.g. contribution title — shown in error UI
  children: ReactNode;
}
```

**Fallback UI:** A small inline element styled with semantic tokens (`text-destructive`, `bg-destructive/10`). Shows the slot name, label, and error message. Includes a "Retry" button that resets state and re-mounts children.

**Size:** ~40 lines.

### Modified: `plugin-core/index.ts`

Add `export { PluginErrorBoundary } from "./error-boundary"`.

### Modified: `web/src/App.tsx`

Wrap `Core.Root` contributions:

```tsx
<PluginErrorBoundary key={i} slot="core.root">
  <r.component />
</PluginErrorBoundary>
```

### Modified: `plugins/shell/web/components/shell-layout.tsx`

Wrap each contribution render site (6 sites):

| Site | Line | Wrap target | `slot` | `label` |
|------|------|-------------|--------|---------|
| Sidebar | 54–64 | Entire `<Fragment>` body | `shell.sidebar` | `pane.title` |
| Toolbar buttons | 73–83 | Each `<Button>` | `shell.toolbar` | `item.label` |
| Toolbar widgets | 86–88 | `<widget.component />` | `shell.toolbar-widget` | — |
| Main panels | 95–97 | `<panel.component />` | `shell.main` | `panel.title` |
| Dynamic panes | 98–100 | `<panel.component />` | `shell.pane` | `panel.id` |
| Status bar | 106–108 | `<item.component />` | `shell.statusbar` | — |

### Why not auto-wrap in `useContributions`?

`useContributions()` returns plain data objects. The slot doesn't know which properties are components (sidebar has both `icon` and `component`), so wrapping must happen at the render site where JSX is written. The 7 render sites are few and explicit.

## Part 2: Smoke Test

### Dependencies (dev, in web workspace)

`vitest`, `@testing-library/react`, `jsdom`

### New file: `web/vitest.config.ts`

Extends `vite.config.ts` via `mergeConfig` to inherit path aliases. Sets `environment: "jsdom"`.

### New file: `web/src/__tests__/plugin-render.test.tsx`

A single test file that iterates over the plugin registry (`web/src/plugins.ts`), finds every contribution with a `component` property, mounts it inside `<PluginProvider>`, and asserts it doesn't throw.

```
for each plugin in plugins:
  for each contribution in plugin.contributions:
    if contribution has a `component` property:
      test("{plugin.name} > {slotId} renders without crashing")
        render(<PluginProvider plugins={plugins}><Component /></PluginProvider>)
```

Components that depend on browser APIs not in jsdom (e.g. xterm) can be skipped via a known-skip list.

### Modified: `web/package.json`

Add script: `"test": "vitest run"`

## Verification

1. Intentionally break a plugin component (throw in render) → the app should show the error inline, not go blank
2. `cd web && bun test` → all plugins pass the smoke test
3. Break a plugin component → `bun test` should fail with a clear error naming the plugin

## Files touched

| File | Action |
|------|--------|
| `plugin-core/error-boundary.tsx` | Create |
| `plugin-core/index.ts` | Add export |
| `web/src/App.tsx` | Wrap 1 render site |
| `plugins/shell/web/components/shell-layout.tsx` | Wrap 6 render sites |
| `web/vitest.config.ts` | Create |
| `web/src/__tests__/plugin-render.test.tsx` | Create |
| `web/package.json` | Add test script + deps |
