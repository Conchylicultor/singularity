import {
  buildPluginTree,
  type PluginTree,
} from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { createGitStateMemo } from "@plugins/infra/plugins/git-read-cache/server";
import { withHeavyReadSlot } from "@plugins/infra/plugins/host-read-pool/server";
import {
  createFileWatcher,
  type FileWatcher,
} from "@plugins/infra/plugins/file-watcher/server";
import { PLUGINS_DIR } from "@plugins/infra/plugins/paths/server";

// Cached, watcher-invalidated plugin-tree accessors.
//
// The hot path (`GET /api/plugin-view/tree`, chip mounts, Settings config-nav)
// only ever wants the cheap structural skeleton — never facets — so it is served
// structure-only and cached here. Caching is legitimate: it coalesces necessary,
// cheap structural work, not the eliminated facet walk.
//
// Invalidation is a single monotonic `generation` counter, bumped by ONE lazy
// @parcel watcher on `PLUGINS_DIR`: any plugin add / remove / edit fires an event
// → generation++ → the memo signature moves → the next `get` rebuilds. Between
// changes every call is a pure cache hit doing zero fs work.
//
// The memo's embedded single-flight coalesces the post-boot subscribe herd (every
// live-state resource re-subscribing at once) onto ONE build — the many concurrent
// callers share the single in-flight compute instead of each walking the tree.

let generation = 0;
let watcherStarted: Promise<FileWatcher> | null = null;

function ensureWatcher(): Promise<FileWatcher> {
  watcherStarted ??= createFileWatcher({
    dirs: [PLUGINS_DIR],
    reconcileMs: null,
    ignore: [
      "**/.git/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
    ],
    onChange: (events) => {
      if (events.length > 0) generation++;
    },
  });
  return watcherStarted;
}

// Structure-only tree (facets OFF) — the hot path.
const structureMemo = createGitStateMemo<PluginTree>({
  name: "plugin-tree.structure",
});

// Full faceted tree, shared by the two genuine facet consumers (Contributions +
// the detail pane). `skipBarrelImport: true` mirrors the previous hot-path build.
const facetsMemo = createGitStateMemo<PluginTree>({
  name: "plugin-tree.facets",
});

export function getStructureTreeCached(): Promise<PluginTree> {
  // eslint-disable-next-line detached-work-safety/no-untracked-detached-work -- idempotent watcher-start guard; returns immediately once armed, the tree build is separately memoized
  void ensureWatcher();
  return structureMemo.get(
    PLUGINS_DIR,
    () => Promise.resolve(String(generation)),
    () => withHeavyReadSlot(() => buildPluginTree(PLUGINS_DIR)),
  );
}

export function getFacetsTreeCached(): Promise<PluginTree> {
  // eslint-disable-next-line detached-work-safety/no-untracked-detached-work -- idempotent watcher-start guard; returns immediately once armed, the tree build is separately memoized
  void ensureWatcher();
  return facetsMemo.get(
    PLUGINS_DIR,
    () => Promise.resolve(String(generation)),
    () =>
      withHeavyReadSlot(() =>
        buildPluginTree(PLUGINS_DIR, { skipBarrelImport: true, facets: true }),
      ),
  );
}
