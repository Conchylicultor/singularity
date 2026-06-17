# Floating window grouping (tabbed windows)

## Problem

Floating desktop mode lets you **tear off** a docked tab into its own free-floating
window, but there is no inverse: no way to **merge** multiple floating windows into
one window that holds several tabs behind a tab strip (browser-style). Each floating
tab is permanently its own window.

## Constraints discovered

- `apps` and `apps/surface` are **load-bearing** — must not change. The whole feature
  lives in `plugins/apps/plugins/surface/plugins/floating/`.
- `apps` models a flat list of `Tab { tabId, appId, store, placement }`. It has **no
  concept of a window**. The floating plugin already owns its own geometry store
  (`use-window-geometry.ts`, keyed by `tabId`) and pushes the box onto the shared
  tab container via the keep-alive `usePlacementStyle` channel.
- `SurfaceBody` renders **one `TabContainer` per floating tab**; each tab's
  `FloatingChrome` pushes its container style. A floating tab's container is always
  `display:block` (`visibleWhenUnfocused`) unless its `FloatingChrome` overrides
  `display:none` (today: when minimized). **This is the seam** — inactive group
  members hide via the same override while staying mounted.

## Design — grouping is entirely internal to the floating plugin

A floating **window** becomes the unit that owns geometry. A window holds an ordered
list of member tabIds and one `activeTabId`. By default every floating tab is its own
singleton window, so existing behavior is byte-identical.

`apps` is never told about windows. The floating plugin maps `tabId → windowId`
internally; merge/split just rewire that mapping.

### Store (`use-floating-windows.ts`, replaces `use-window-geometry.ts`)

```ts
type WindowId = string;
interface FloatingWindow {
  id: WindowId;
  members: string[];   // ordered tabIds = tab-strip order
  activeTabId: string; // the shown member
  geo: Geometry;       // x/y/w/h/z/pinned/minimized/snap/restore (unchanged type)
}
```

Module state: `windows: Map<WindowId, FloatingWindow>` + derived `tabToWindow:
Map<tabId, WindowId>`. The existing dense-z `reorder()`, snap state machine,
`clampToBounds`, persist/hydrate logic all carry over **keyed by windowId** instead
of tabId. `Geometry` and all of `use-snap.ts` are untouched.

API:
- `useTabWindow(tabId) → { window, isActive, setGeo, bringToFront }` — auto-creates a
  singleton window on first read (cascade `defaultGeometry()`).
- `useFloatingWindows() → Map<WindowId, FloatingWindow>` — reactive, for the dock.
- `windowForTab(tabId) → WindowId | undefined` — imperative resolver (commands).
- `mergeTabIntoWindow(tabId, targetWindowId, atIndex?)` — detach from current window
  (drop it if it empties), insert into target, set target.activeTabId = tabId.
- `splitTabToNewWindow(tabId, point?)` — detach into a fresh singleton window at point.
- `setActiveMember(windowId, tabId)`.
- `reorderMember(windowId, tabId, atIndex)`.
- module ops keyed by windowId: `bringWindowToFront`, `toggleWindowPin`,
  `restoreWindow(minimize)`, `snapWindowDirection`.
- `pruneWindows(openTabIds)` — drop closed members, delete empty windows, repair
  `activeTabId`. (replaces `pruneWindowGeometry`.)

Persistence key stays `app-windows:<sessionTabId>`; serialize `windows`. Hydrate
migrates the legacy `Record<tabId, Geometry>` shape by wrapping each entry as a
singleton window.

### FloatingChrome (per floating tab)

- Resolve `window = useTabWindow(tabId)`.
- Push container box from `window.geo`. If `tabId !== window.activeTabId`, push
  `{ ...box, display:"none" }` so inactive members stay mounted but hidden. Active
  member pushes the visible box (minimized hides all members → only the dock chip).
- Render `WindowChrome` **only for the active member** (one titlebar per window).
- When this tab becomes globally `focused` but isn't its window's active member, call
  `setActiveMember` (keeps the model consistent when focus arrives from cycle/dock).

### WindowChrome — in-window tab strip

Titlebar layout: `[system-menu icon] [tab strip: member chips] [flex move-region]
[window controls]`.

- Tab strip: one chip per member (`app icon + title + close ×`). A single-member
  window shows one chip (looks like a browser with one tab). Click a chip →
  `setActiveMember` + `focusTab`. Chip × → `closeTab(member)`.
- Empty titlebar / move-region → window move (existing titlebar drag), so chips
  `stopPropagation` on pointerdown.
- Right window-controls **close (X) closes the whole window** (closeTab every member);
  per-tab close is the chip ×.
- Move / resize / snap / minimize / maximize / pin all operate on `window.geo`
  (unchanged logic).
- System menu gains, for accessibility + as the non-drag affordance:
  - **Merge into ▸** submenu listing other open windows → `mergeTabIntoWindow`.
  - **Move tab to new window** (enabled when grouped) → `splitTabToNewWindow`.

### Dock + commands

- Dock: one chip per **window** (label = active member title, `(N)` when grouped).
  Click focuses the window's active member.
- `window-commands.ts`: snap/minimize/pin/close resolve `windowForTab(focusedTabId)`.
  `mod+w` closes the active member (= focused tab; browser-like). `cycleWindows`
  cycles between **windows** (next window's active member), order derived from the
  apps tab order via `windowForTab`.

## Merge / split UX — two layers

1. **Menu-driven (Phase 1):** system-menu "Merge into ▸" / "Move tab to new window".
   Fully usable, accessible, low-risk. Ships the whole feature.
2. **Drag-driven (Phase 2):** browser-style. Custom pointer drag on a tab chip
   (mirrors this plugin's module-channel idioms — like `snapPreview`):
   - reorder within the same strip,
   - drop on another window's strip → `mergeTabIntoWindow` (+ insertion indicator),
   - drop on empty desktop → `splitTabToNewWindow` at the drop point,
   - a drag-ghost + drop preview overlay rendered in the floating Foreground.

   Windows mark their strip drop-zone with `data-floating-window-id`; the drag
   hit-tests via `document.elementFromPoint`.

## Why this is the clean design

- Zero changes to load-bearing `apps`/`surface`. The window concept is a private
  refinement of the floating store; the placement contract (`PlacementDef`,
  `usePlacementStyle`) is unchanged.
- The geometry unit moves from "tab" to "window" — the honest model (a window has
  geometry; tabs are its contents). Singleton windows preserve all existing behavior.
- Merge and split are pure store mutations; both the menu and the drag layer call the
  same four functions.

## Phasing

- **Phase 1:** store refactor + grouped chrome + tab strip + dock + commands +
  menu-based merge/split. Builds, screenshot-verified. Feature complete (menu).
- **Phase 2:** drag-based merge/split/reorder + ghost/indicator overlay. Polish.
</content>
</invoke>
