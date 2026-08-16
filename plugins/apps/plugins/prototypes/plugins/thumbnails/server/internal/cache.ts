import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

/**
 * Where rendered thumbnails live: host-global, outside every worktree, exactly
 * like `asset-mirror`'s cache.
 *
 * Host-global is safe *because* the filename is the content fingerprint — two
 * worktrees holding a byte-identical prototype address the same PNG and share
 * one render, while a worktree that has edited its copy addresses a different
 * one. It also has to live outside `prototypes/`: the
 * `prototypes:self-contained` check rejects any subdirectory in a prototype
 * folder, and a derived artifact has no business being committed anyway.
 */
export const THUMBNAIL_CACHE_DIR = join(
  SINGULARITY_DIR,
  "prototype-thumbnails",
);

function thumbnailPath(key: string): string {
  return join(THUMBNAIL_CACHE_DIR, `${key}.png`);
}

/** Is this fingerprint already rendered? */
export async function hasThumbnail(key: string): Promise<boolean> {
  return Bun.file(thumbnailPath(key)).exists();
}

/** The cached PNG for a fingerprint, for the serving route. */
export function readThumbnail(key: string): ReturnType<typeof Bun.file> {
  return Bun.file(thumbnailPath(key));
}

/**
 * Write a rendered PNG under its fingerprint. Temp file + `rename`, so a
 * concurrent reader never observes a half-written image — the same atomicity
 * `asset-mirror` relies on.
 */
export async function writeThumbnail(
  key: string,
  bytes: Uint8Array,
): Promise<void> {
  await mkdir(THUMBNAIL_CACHE_DIR, { recursive: true });
  const tmp = join(THUMBNAIL_CACHE_DIR, `.${key}.${randomUUID()}.tmp`);
  await Bun.write(tmp, bytes);
  await rename(tmp, thumbnailPath(key));
}

/**
 * Drop thumbnails untouched for `maxAgeMs`. Age, not reachability: a prototype
 * that is deleted and restored, or an old fingerprint that becomes current
 * again, is simply re-rendered — so the cheap sweep can never delete something
 * unrecoverable. Returns how many files were removed.
 */
export async function sweepThumbnails(maxAgeMs: number): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  let entries;
  try {
    entries = await readdir(THUMBNAIL_CACHE_DIR, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const abs = join(THUMBNAIL_CACHE_DIR, entry.name);
    const info = await stat(abs);
    if (info.mtimeMs >= cutoff) continue;
    await unlink(abs);
    removed++;
  }
  return removed;
}
