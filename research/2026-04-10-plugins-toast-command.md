# Toast Command

## Context

Any plugin needs a way to show ephemeral feedback (success, error, info). Today there's no toast infrastructure. A `Shell.Toast` command fits the existing pattern — same shape as `Shell.OpenPane`, shell owns the rendering, consumers just call the command.

## Plan

### 1. Install shadcn sonner

```sh
cd web && bunx shadcn@latest add sonner
```

This creates `web/src/components/ui/sonner.tsx` and adds the `sonner` dependency.

### 2. Add `Shell.Toast` command

**File: `plugins/shell/web/commands.ts`**

Add a `ToastArgs` type and a `Toast` command alongside `OpenPane`:

```ts
export interface ToastArgs {
  title?: string;
  description: string;
  variant?: "default" | "destructive";
}

export const Shell = {
  OpenPane: defineCommand<PaneDescriptor, string>("shell.open-pane"),
  Toast: defineCommand<ToastArgs, void>("shell.toast"),
};
```

### 3. Wire the handler in shell-layout

**File: `plugins/shell/web/components/shell-layout.tsx`**

- Import `toast` from `sonner` and `<Toaster>` from `@/components/ui/sonner`
- Register handler: `Shell.Toast.useHandler(({ title, description, variant }) => { ... })` — delegates to sonner's `toast()` / `toast.error()` based on variant
- Render `<Toaster />` at the end of the layout JSX (outside `SidebarProvider`, as a sibling — it uses a portal)

### 4. Verify

```sh
cd web && bun run build
bunx vite preview --port 9000
```

Add a temporary `Shell.Toast({ description: "hello" })` call in an existing plugin (e.g. a toolbar button onClick) to confirm it renders.

## Files to modify

| File | Change |
|---|---|
| `web/package.json` | sonner added by shadcn CLI |
| `web/src/components/ui/sonner.tsx` | Created by shadcn CLI |
| `plugins/shell/web/commands.ts` | Add `ToastArgs` + `Shell.Toast` |
| `plugins/shell/web/components/shell-layout.tsx` | Import Toaster/toast, register handler, render `<Toaster />` |
