import { createFileWatcher } from "@plugins/infra/plugins/file-watcher/server";
import { serveValue } from "@plugins/network/plugins/live/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { depsStates, type DepRow } from "../../core";
import { depsCacheDir } from "../../data-dirs";
import { declaredDeps, depState } from "../../deps";

async function loadDepRows(): Promise<DepRow[]> {
  return Promise.all(
    (await declaredDeps()).map(async (dep) => ({
      id: dep.id,
      owner: dep.owner,
      description: dep.description,
      sizeHint: dep.sizeHint,
      kind: dep.source.kind,
      source: dep.source.label,
      updates: dep.updates,
      state: await depState(dep),
    })),
  );
}

/**
 * Every declared dependency with its state, pushed.
 *
 * The truth is files under the deps cache, written by whichever process
 * installs (a supervised child, a `./singularity deps` command) — so the push
 * comes from a watcher on that directory for as long as anyone is subscribed,
 * not from polling. The payloads (`env/`) are ignored: a `uv sync` writes
 * thousands of files there, and only the state files beside them matter.
 *
 * External and bounded by the declared set, which the process holds.
 */
export const depsStatesServed = serveValue(depsStates, {
  source: "external",
  loader: loadDepRows,
  whileSubscribed: async (_params, notify) => {
    const watcher = await createFileWatcher({
      dirs: [depsCacheDir.ensure()],
      name: "deps-cache",
      ignore: ["**/env/**"],
      onChange: () => notify(),
    });
    // The stop is fire-and-forget (unsubscribing does not wait on parcel),
    // tracked so its cost lands on its own span.
    return () => {
      void runTracked("deps-cache:watcher-stop", () => watcher.stop());
    };
  },
});
