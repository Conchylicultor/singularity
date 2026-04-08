# Shell Professional Styling

## Context

The app shell (`plugins/shell/web/components/shell-layout.tsx`) has no visual differentiation between regions — no background colors, raw `<button>` elements, and browser-default scrollbars. The theme token system in `app.css` is complete (light/dark mode, full color palette) but barely used. Only one shadcn component (Button) is installed. This plan applies the existing tokens and adds a few shadcn components to make the app look professional with minimal effort.

## Approach

### Step 1: Install shadcn components

From `web/`:

```sh
bunx shadcn@latest add separator scroll-area tooltip
```

Also install `lucide-react` (shadcn's configured icon library, referenced in `components.json` but missing from `package.json`):

```sh
bun add lucide-react
```

### Step 2: Apply theme tokens to shell regions

Modify `plugins/shell/web/components/shell-layout.tsx`:

| Region | Change |
|--------|--------|
| **Header** | Add `bg-muted/50`, `justify-between`. Wrap toolbar items in a `<div>` to allow right-side controls. |
| **Sidebar** | Add `bg-muted/30`. Replace `overflow-y-auto` with `<ScrollArea>`. Add `<Separator>` between contributions. |
| **Main** | Wrap content in `<ScrollArea>`. |
| **StatusBar** | Add `bg-muted/50` to match header. |

This creates visual depth: muted chrome (header/statusbar) > semi-muted nav (sidebar) > bright content (main).

### Step 3: Replace raw buttons with shadcn Button

Toolbar buttons currently use raw `<button>` with hand-rolled classes. Replace with `<Button variant="ghost" size="sm">` for consistent focus rings, hover states, and sizing.

### Step 4: Add dark mode toggle

Create `plugins/shell/web/components/theme-toggle.tsx` — a small component using:
- `Button` (variant="ghost", size="icon")
- `Tooltip` for hover label
- `Sun`/`Moon` icons from `lucide-react`
- Toggles `.dark` class on `<html>`

Render it in the header's right side.

### Why NOT use shadcn Sidebar component

The shadcn `Sidebar` is a large opinionated system (`SidebarProvider`, `SidebarMenu`, `SidebarMenuItem`) that expects declarative menu items. It conflicts with the slot contribution model where plugins provide arbitrary components. The current `<aside>` with token styling is the right abstraction.

## Files to modify

- `plugins/shell/web/components/shell-layout.tsx` — all styling changes
- `plugins/shell/web/components/theme-toggle.tsx` — new file (dark mode toggle)
- `web/package.json` — new deps from shadcn add + lucide-react

## Files for reference (no changes)

- `web/src/app.css` — theme tokens
- `web/components.json` — shadcn config
- `web/src/components/ui/button.tsx` — existing Button component

## Verification

```sh
cd web && bun dev
```

1. App should show subtle background differentiation between header, sidebar, main, and statusbar
2. Scrollbars in sidebar and main should be styled (thin, themed)
3. Toolbar buttons should have proper focus rings and hover states
4. Dark mode toggle should switch between light/dark themes
5. All plugin contributions should render unchanged
