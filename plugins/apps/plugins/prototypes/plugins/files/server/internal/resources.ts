import { serveValue } from "@plugins/network/plugins/live/server";
import { prototypesList, prototypesVersion } from "../../core";
import { listPrototypeMetas } from "./list";

/**
 * `prototypes.list` — re-reads every prototype's `index.html` on each notify.
 * External: the truth is the data dir, and the watcher (`watcher.ts`) notifies
 * when the tree really moved.
 */
export const prototypesListServed = serveValue(prototypesList, {
  source: "external",
  loader: async () => listPrototypeMetas(),
});

/**
 * `prototypes.version` — a timestamp bumped on every file change. The loader
 * returns the current bump, so a cold HTTP read still gets a value.
 */
let currentVersion = Date.now();

export const prototypesVersionServed = serveValue(prototypesVersion, {
  source: "external",
  loader: () => currentVersion,
});

/** Advance the version (called by the watcher on any prototype file change). */
export function bumpPrototypesVersion(): void {
  currentVersion = Date.now();
}
