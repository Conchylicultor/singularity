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
});

export default [wallpaperDir];
