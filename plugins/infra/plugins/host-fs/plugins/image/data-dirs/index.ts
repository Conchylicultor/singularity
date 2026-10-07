import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * Resized copies of host images: `<sha256(path, version, edge)>.{jpg,webp}`,
 * plus `.tmp-*` files while one is being written (renamed into place).
 *
 * `cache`, and genuinely so: a missing copy is made again on the next request.
 * Host-wide on purpose: every worktree shares one copy per image and size. The
 * daily `host-fs-image.sweep` bounds it (30 days unused, then 1 GB).
 */
export const resizedImagesDir = defineDataDir({
  kind: "cache",
  name: "host-fs-resized-images",
  owner: "infra/host-fs/image",
  description:
    "Resized copies of host images (thumbnails and screen-sized views), made again when missing",
  reclaim: { kind: "safe" },
});

export default [resizedImagesDir];
