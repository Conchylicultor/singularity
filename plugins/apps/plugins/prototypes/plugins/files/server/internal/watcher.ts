import { mkdir } from "node:fs/promises";
import {
  createFileWatcher,
  type FileWatcher,
} from "@plugins/infra/plugins/file-watcher/server";
import { PROTOTYPES_DIR } from "./paths";
import {
  prototypesResource,
  prototypesVersionResource,
  bumpPrototypesVersion,
} from "./resources";

let watcher: FileWatcher | null = null;
let started = false;

/**
 * Watch `prototypes/` for edits. On any change: re-broadcast the list (new/edited
 * mocks appear in the gallery) and bump the version (open iframes cache-bust and
 * reload). Push-based — no polling.
 */
export async function startPrototypesWatcher(): Promise<void> {
  if (started) return;
  started = true;

  // @parcel/watcher errors if the watched dir doesn't exist; the content lives
  // in prototypes/ authored separately, so ensure it exists before subscribing.
  await mkdir(PROTOTYPES_DIR, { recursive: true });

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
