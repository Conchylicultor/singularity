import { z } from "zod";
import { defineSupervisedJob } from "@plugins/infra/plugins/jobs/plugins/supervised-job/server";
import { defineLogSink } from "@plugins/primitives/plugins/log-channels/server";
import type { Dep, DepSource } from "./dep";
import { ensureDep } from "./ensure";
import { declaredDep } from "./registry";

// The installs' transcripts, at `logs/deps-install.jsonl` of the backend that
// supervises them (the child's own output, tailed).
const depsInstallLog = defineLogSink({
  id: "deps-install",
  description:
    "Dependency installs requested from the app (Settings → Dependencies, a feature's first use): each install's progress and its installer's output.",
});

/**
 * Install one declared dependency, in a detached child
 * (`./singularity supervised-exec deps.install`): a Python env is hundreds of
 * MB of downloads that must neither block a backend's event loop nor die with a
 * restart.
 *
 * `lock` is the dep id, so a second request while one installs claims nothing
 * and returns. `ensureDep` itself is idempotent and takes the host flock, so a
 * CLI install of the same identity running meanwhile is waited for, not
 * duplicated.
 */
export const depsInstallJob = defineSupervisedJob({
  name: "deps.install",
  input: z.object({ id: z.string() }),
  channel: depsInstallLog,
  lock: ({ id }) => id,
  async run({ id }, { log, exec }) {
    await ensureDep(declaredDep(id), exec, { log });
  },
});

/**
 * Ask for `dep` to be installed, from anywhere — a request handler included.
 * Enqueues the `deps.install` job and returns at once; the install's progress
 * shows on `depState` / the `deps.states` live value.
 */
export async function requestDep(dep: Dep<DepSource>): Promise<void> {
  await depsInstallJob.enqueue({ id: dep.id });
}
