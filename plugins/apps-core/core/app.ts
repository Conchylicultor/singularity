/**
 * The desktop — the meta-app that frames every app: the app rail, the tab bar,
 * the surface modes (docked / floating windows / solo) and the floating
 * desktop's wallpaper. `apps-core` IS that app.
 *
 * A plain identity rather than a `defineApp` `AppRef`: the desktop has no
 * `Apps.App` entry, no route and no rail icon — it is the frame the other apps
 * render inside, never one of them. What it does need is a name to own things
 * under, the same way a regular app does. Today that is its one data dir,
 * `apps/desktop` (`apps-core/data-dirs/`), whose `defineAppDataDir` takes any
 * `{ id }` — this object satisfies it without inventing a route.
 *
 * Plain data on purpose: `core/` is web-reachable, so this file imports
 * nothing. The name→owning-plugin pairing (`desktop` → `apps-core`) is the
 * paths plugin's closed meta-app table, not something this constant claims.
 */
export const desktopApp = { id: "desktop" } as const;
