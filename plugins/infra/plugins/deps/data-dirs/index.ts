import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * Every installed dependency, content-addressed and host-wide:
 * `<id>/<identity>/` holds the payload (`env/`), `ready.json` (written last —
 * its presence is the whole definition of "installed"), `install.log`,
 * `installing.json` while an install holds the lock, `failed.json` after one
 * threw, and `last-used`.
 *
 * `cache`, and genuinely so: every entry is re-installed on demand from the
 * declaration that derived its identity. Worktrees on the same identity share
 * one install; a worktree trialling an upgrade gets its own.
 */
export const depsCacheDir = defineDataDir({
  kind: "cache",
  name: "deps",
  owner: "infra/deps",
  description:
    "Installed on-demand dependencies (Python envs, …), one dir per dep id and identity; re-installed when missing",
  reclaim: { kind: "safe" },
});

/**
 * One flock file per `<id>-<identity>`: the host-wide lock that makes one
 * process install a given identity, and that the sweep holds while it removes
 * one. Kernel-lock state only — flock releases on process death.
 */
export const depsLocksDir = defineDataDir({
  kind: "locks",
  name: "deps",
  owner: "infra/deps",
  description:
    "flock files making one process on the machine install (or remove) a given dependency identity",
  reclaim: { kind: "restart" },
});

export default [depsCacheDir, depsLocksDir];
