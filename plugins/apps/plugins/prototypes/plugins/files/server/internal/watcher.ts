import {
  createFileWatcher,
  type FileWatcher,
} from "@plugins/infra/plugins/file-watcher/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { prototypesDir } from "../../data-dirs";
import { seedTemplate } from "./seed";
import {
  prototypesResource,
  prototypesVersionResource,
  bumpPrototypesVersion,
} from "./resources";
import { readPrototypesSignature } from "./signature";

let watcher: FileWatcher | null = null;
let started = false;

const listeners: (() => void)[] = [];

/** The tree as of the last time it was looked at — see {@link readPrototypesSignature}. */
let lastSignature: string | null = null;

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
 * Re-read the tree; if its bytes really moved, re-broadcast the list (new/edited
 * mocks appear in the gallery), bump the version (open iframes cache-bust and
 * reload) and wake the listeners.
 *
 * Everything goes through this one gate — the watcher's events and the
 * reconcile tick alike — because the version is a RELOAD. A prototype on screen
 * is a live app the author is clicking through, and a reload throws that state
 * away, so "the watcher woke up" is not enough of a reason: the tree has to
 * have actually changed.
 */
async function refreshOnce(): Promise<void> {
  const signature = await readPrototypesSignature();
  if (signature === lastSignature) return;
  lastSignature = signature;

  bumpPrototypesVersion();
  prototypesResource.notify();
  prototypesVersionResource.notify();
  for (const listener of listeners) listener();
}

// Single-flight with a trailing re-run: a signature read is async, so two
// triggers arriving together must not each compare against a stale `lastSignature`
// and bump twice for one edit — that is two reloads of the same iframe.
let refreshing = false;
let refreshAgain = false;

async function refresh(): Promise<void> {
  if (refreshing) {
    refreshAgain = true;
    return;
  }
  refreshing = true;
  try {
    do {
      refreshAgain = false;
      await refreshOnce();
    } while (refreshAgain);
  } finally {
    refreshing = false;
  }
}

/**
 * Watch `prototypes/` for edits. Push-based — no polling; the 30s reconcile is a
 * backstop for an fsevent parcel drops, and costs one stat per prototype file
 * because it changes nothing when the signature matches.
 */
export async function startPrototypesWatcher(): Promise<void> {
  if (started) return;
  started = true;

  // @parcel/watcher errors if the watched dir doesn't exist; the content is
  // authored separately (and lives outside any checkout), so ensure it exists
  // before subscribing. Seeding the template needs the dir too, and needs to
  // land before the first list so the blank page is there to copy.
  prototypesDir.ensure();
  await seedTemplate();

  // The tree as it stands at boot is the baseline, so the first genuine edit is
  // what bumps the version — not the first tick after start.
  lastSignature = await readPrototypesSignature();

  watcher = await createFileWatcher({
    dirs: [prototypesDir.path],
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
      void runTracked("prototypes:refresh", () => refresh());
    },
    onReconcile: () => {
      void runTracked("prototypes:reconcile", () => refresh());
    },
  });
}

export async function stopPrototypesWatcher(): Promise<void> {
  if (!started) return;
  started = false;
  lastSignature = null;
  if (watcher) {
    await watcher.stop();
    watcher = null;
  }
}
