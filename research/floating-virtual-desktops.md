# Floating desktop mode: virtual desktops (workspaces)

## Problem

Floating ("desktop") placement is single-surface: every floating window lives on
one implicit desktop. There is no way to organize windows across multiple virtual
desktops / workspaces (the macOS Spaces / GNOME workspaces / Win11 desktops
model). This adds that, staying entirely within the floating placement plugin —
no load-bearing (`apps` / `surface`) changes, since `PlacementDef`
(Backdrop / Foreground / Chrome + the keep-alive style channel) already gives the
plugin everything it needs.

There is **no** multi-monitor concept — a virtual desktop is purely a logical
grouping of windows over the same single surface. Switching desktops re-uses the
existing keep-alive "hidden" mechanism: off-desktop windows stay mounted but
`display:none`, so a switch is instant with zero remounts.

## Model (use-floating-windows.ts)

- New `Desktop = { id: string; name?: string }`. Module-global ordered
  `desktops: Desktop[]` + `activeDesktopId`, both persisted. Ids mint monotonically
  (`d1, d2, …`).
- `FloatingWindow` gains a top-level `desktopId: string` (a window-organization
  property, NOT part of `Geometry`'s box/chrome). New windows are minted on the
  current `activeDesktopId`.
- One default desktop (`d1`) is created lazily during `hydrate()` if none persist.

### Operations (all persist + notify)

- `createDesktop({ activate? })` → mint, optionally switch.
- `removeDesktop(id)` → no-op if it's the last desktop; reassign its windows to the
  adjacent desktop (prev, else next); if it was active, switch to that neighbour.
- `setActiveDesktop(id)` → switch (focus handled by the caller, see below).
- `moveWindowToDesktop(windowId, desktopId)` → reassign the window's `desktopId`.
- `topmostWindowOnDesktop(id)` → highest-`z` non-minimized window on a desktop
  (for focus-on-switch).
- Reactive `useDesktops()` → `{ desktops, activeDesktopId }`.

### Persistence + migration

sessionStorage shape becomes
`{ windows: Record<WindowId, PersistedWindow>, desktops: Desktop[], activeDesktopId }`.
`PersistedWindow` gains `desktopId`. Legacy shapes (a bare
`Record<WindowId, PersistedWindow>` or the even older `Record<tabId, Geometry>`)
are detected by the absence of the `windows` key and migrated: every window lands
on a freshly-minted single default desktop.

## Visibility (use-window-motion.ts)

`useFloatingWindowStyle` gains an `onActiveDesktop: boolean` param. An off-desktop
window is hidden (`display:none`) with **no** transition/transform — it is not an
animated minimize, it simply isn't on this desktop. Folded into the existing
`hidden` term: `hidden = !onActiveDesktop || (existing minimize/inactive rules)`.

`FloatingChrome` reads `useDesktops()`, computes
`onActiveDesktop = win.desktopId === activeDesktopId`, and passes it through.

## Per-desktop scoping

- **Dock** (`window-dock.tsx`): window chips filter to the active desktop.
- **Cycle** (`mod+\``, `window-commands.ts`): cycles only active-desktop windows.

## UX surfaces

### Workspace pager (new `workspace-pager.tsx`)

A compact pager composed into the **left** of the existing bottom-center dock bar,
separated from the window chips by a thin divider — one cohesive bottom shelf
(KDE / ChromeOS pattern), never two competing centered bars. The pager honours the
passive-backdrop invariant: it organizes windows, it is not an app launcher, and it
lives in chrome (the dock), never painted on the wallpaper.

- One pill per desktop (numbered `1..N`), active pill highlighted, tooltip
  `Desktop N · k window(s)`. Click → switch + focus the new desktop's topmost
  window.
- Trailing `+` pill → create a desktop and switch to it.
- When `>1` desktop, a pill reveals a small × on hover → `removeDesktop`.
- The dock bar now always renders while the floating Foreground is mounted (even
  when the active desktop has zero windows — the user must still see/switch
  desktops). Empty active desktop → just wallpaper + the pager, which is correct
  and calm.

### Window system menu (`window-system-menu.tsx`)

New "Move to desktop ▸" submenu: every desktop (current one checked + disabled) +
"New desktop". Threaded `FloatingChrome → WindowChrome → WindowSystemMenu`.

### Keyboard (index.ts + window-commands.ts)

Page keys, collision-free with the `ctrl+alt+arrow` snap family:

- `ctrl+alt+pagedown` / `ctrl+alt+pageup` → next / prev desktop (wraps), focus top.
- `ctrl+alt+shift+pagedown` / `…+pageup` → move focused window to next / prev
  desktop and follow it. Moving past the last desktop creates a new one; moving
  before the first clamps.

Focus-on-switch uses the existing tabs-bridge (`focusTab`) the window commands
already consume, plus `topmostWindowOnDesktop`.

## Explicitly out of scope (follow-ups)

- Drag-a-window-onto-a-pager-pill to move it across desktops (menu + shortcuts
  cover moving for now).
- Mission-Control-style overview / desktop thumbnails.
- Per-desktop wallpaper.
- Renaming desktops (pills are numbered; auto-named "Desktop N").
