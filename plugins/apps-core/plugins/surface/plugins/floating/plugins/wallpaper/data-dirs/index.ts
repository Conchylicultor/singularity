import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The current desktop wallpaper: the image bytes plus the sidecar naming their
 * mime and version.
 *
 * `apps` rather than `cache` because an uploaded image is the ONLY copy — a
 * wallpaper the user chose from their own disk cannot be re-derived from
 * anything, so this is user content and never reclaimable.
 */
export const wallpaperDir = defineDataDir({
  kind: "apps",
  name: "wallpaper",
  owner: "apps-core/surface/floating/wallpaper",
  description:
    "The current desktop wallpaper image and its mime/version sidecar",
  reclaim: {
    kind: "never",
    reason:
      "an uploaded wallpaper is the only copy of that image — deleting it loses the user's chosen desktop",
  },
  // Nothing moves on disk in this commit: the declaration must keep resolving to
  // the directory that already holds the image, or the desktop would silently
  // read an empty dir and the user's wallpaper would appear to have vanished.
  legacyLocation: {
    path: "wallpaper",
    reason: "not yet moved; relocates in the layout migration",
  },
});

export default [wallpaperDir];
