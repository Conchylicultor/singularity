import { readdir, realpath } from "node:fs/promises";
import { extname, join, sep } from "node:path";
import { getConfig } from "@plugins/config_v2/server";
import {
  getSongMidiBySourcePath,
  setSourceMissing,
  listFolderImportedSongs,
} from "@plugins/apps/plugins/sonata/plugins/sources/plugins/midi/server";
import { midiFoldersConfig } from "../../shared/config";
import { importMidiFileJob } from "./import-job";

const MIDI_EXTENSIONS = new Set([".mid", ".midi"]);

/**
 * Configured folder paths, canonicalized to their real (symlink-resolved) form.
 *
 * The OS file-watcher (parcel/FSEvents) reports the canonical path — on macOS
 * `/tmp/x` surfaces as `/private/tmp/x`. If reconcile scanned the literal config
 * path while the watcher emitted the canonical one, the same file would be
 * tracked under two `source_path`s and imported twice. Resolving here makes the
 * watcher dirs, the reconcile scan, and the drift `startsWith` check all agree
 * on one canonical path — the single idempotency key. A dir that doesn't exist
 * yet can't be resolved; we keep its literal path (reconcile then skips it as
 * ENOENT, and the watcher surfaces its own subscribe error).
 */
export async function watchedDirs(): Promise<string[]> {
  const paths = getConfig(midiFoldersConfig).folders.map((f) => f.path);
  return Promise.all(
    paths.map(async (p) => {
      try {
        return await realpath(p);
      } catch (err) {
        // Expected: a configured folder that doesn't exist yet can't be
        // resolved. Keep the literal path (reconcile skips it as ENOENT). Any
        // other error is unexpected — surface it.
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return p;
        throw err;
      }
    }),
  );
}

/** List the absolute paths of `.mid`/`.midi` files anywhere under `dir`
 * (recursively, into subfolders). A missing dir is logged and skipped (expected:
 * a configured path may not exist yet), not crashed. Other errors propagate. */
async function listMidiFiles(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(`[midi-folders] watched dir does not exist, skipping: ${dir}`);
      return [];
    }
    throw err;
  }
  // With `recursive`, each entry's containing directory is `parentPath` (not the
  // scan root), so the full path must be rebuilt from it.
  return entries
    .filter((e) => e.isFile() && MIDI_EXTENSIONS.has(extname(e.name).toLowerCase()))
    .map((e) => join(e.parentPath, e.name));
}

/**
 * Bring the DB in sync with disk across all watched folders. Catches drift that
 * the live watcher cannot: changes while the server was down, and pre-existing
 * files in a newly added folder (the watcher emits no events for those).
 *
 * - On-disk file with no song → enqueue import.
 * - On-disk file whose song is flagged missing (file came back) → enqueue
 *   re-import (refreshes bytes and clears the flag).
 * - Folder-imported song under a still-watched dir whose file is gone → mark
 *   missing. Songs under a no-longer-watched dir are left untouched.
 */
export async function reconcile(): Promise<void> {
  const dirs = await watchedDirs();

  const onDisk = new Set<string>();
  for (const dir of dirs) {
    const files = await listMidiFiles(dir);
    for (const path of files) {
      onDisk.add(path);
      const existing = await getSongMidiBySourcePath(path);
      if (!existing || existing.sourceMissing) {
        await importMidiFileJob.enqueue({ sourcePath: path });
      }
    }
  }

  // Drift the other way: a folder-managed song whose file vanished. Only mark
  // missing when the song's source path is still under a watched dir — a folder
  // removed from config leaves its songs untouched.
  const songs = await listFolderImportedSongs();
  for (const song of songs) {
    if (song.sourceMissing) continue;
    if (onDisk.has(song.sourcePath)) continue;
    const stillWatched = dirs.some((dir) =>
      song.sourcePath.startsWith(dir.endsWith(sep) ? dir : dir + sep),
    );
    if (stillWatched) await setSourceMissing(song.songId, true);
  }
}
