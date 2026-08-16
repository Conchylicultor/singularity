import { mkdir } from "node:fs/promises";
import {
  createFileWatcher,
  type FileWatcher,
} from "@plugins/infra/plugins/file-watcher/server";
import { PROTOTYPES_DIR } from "./paths";
import { seedTemplate } from "./seed";
import {
  prototypesResource,
  prototypesVersionResource,
  bumpPrototypesVersion,
} from "./resources";

let watcher: FileWatcher | null = null;
let started = false;

const listeners: (() => void)[] = [];

/**
 * Subscribe to "something under `prototypes/` changed".
 *
 * This plugin owns the directory and therefore runs the ONLY watcher over it —
 * a second subscription to the same tree from another plugin would double every
 * filesystem event. So the signal it already computes is exported rather than
 * re-derived: a consumer that needs to react to an edit (the thumbnail
 * renderer) listens here instead of watching.
 *
 * Process-lifetime, like the watcher itself — there is no unsubscribe because
 * every listener is registered once, in a plugin's `onReady`.
 */
export function onPrototypesChanged(listener: () => void): void {
  listeners.push(listener);
}

/**
 * Watch `prototypes/` for edits. On any change: re-broadcast the list (new/edited
 * mocks appear in the gallery) and bump the version (open iframes cache-bust and
 * reload). Push-based — no polling.
 */
export async function startPrototypesWatcher(): Promise<void> {
  if (started) return;
  started = true;

  // @parcel/watcher errors if the watched dir doesn't exist; the content is
  // authored separately (and lives outside any checkout), so ensure it exists
  // before subscribing. Seeding the template needs the dir too, and needs to
  // land before the first list so the blank page is there to copy.
  await mkdir(PROTOTYPES_DIR, { recursive: true });
  await seedTemplate();

  watcher = await createFileWatcher({
    dirs: [PROTOTYPES_DIR],
    // Everything a self-contained prototype can ship. No `.jsx`: JSX lives
    // inline in index.html, because Babel fetches an external `src` with XHR
    // and Chrome blocks that over file:// (the `prototypes:self-contained`
    // check rejects such a script tag, so an external .jsx cannot exist).
    extensions: [
      ".html",
      ".css",
      ".js",
      ".json",
      ".svg",
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".gif",
      ".woff2",
    ],
    onChange: () => {
      bumpPrototypesVersion();
      prototypesResource.notify();
      prototypesVersionResource.notify();
      for (const listener of listeners) listener();
    },
  });
}

export async function stopPrototypesWatcher(): Promise<void> {
  if (!started) return;
  started = false;
  if (watcher) {
    await watcher.stop();
    watcher = null;
  }
}
