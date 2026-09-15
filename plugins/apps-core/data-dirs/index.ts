import { defineAppDataDir } from "@plugins/infra/plugins/paths/core";
import { desktopApp } from "../core";

/**
 * The desktop meta-app's one data dir, `apps/desktop` — the durable files of
 * the frame every app renders inside (rail, tab bar, surfaces).
 *
 * Declared here, at `apps-core`, because `apps-core` is the desktop: like a
 * regular app it owns exactly ONE `apps/<app>` dir, and each of its sub-plugins
 * takes an area inside it with `desktopDir.subdir("<area>")` rather than a dir
 * of its own. Today the one area is `wallpaper/` (the floating desktop's
 * current image and its sidecar), whose only copy is the file the user
 * uploaded — which is why an app dir is never reclaimable.
 *
 * `movedFrom`: the wallpaper used to be its own top-level app dir,
 * `apps/wallpaper`, declared by the wallpaper sub-plugin as if it were an app.
 * The declaration records that, so the move is performed by the paths
 * primitive rather than a one-off script: until the host's singleton process
 * (main) has moved the bytes into `apps/desktop/wallpaper` — leaving a symlink
 * at the old name for older checkouts — every other process keeps resolving
 * the old location. A worktree build of this change therefore touches nothing
 * on the shared root.
 */
export const desktopDir = defineAppDataDir(desktopApp, {
  owner: "apps-core",
  description:
    "The desktop meta-app's host-global data — currently the floating desktop's wallpaper image and its mime/version sidecar",
  movedFrom: [{ from: "apps/wallpaper", to: "wallpaper" }],
});

export default [desktopDir];
