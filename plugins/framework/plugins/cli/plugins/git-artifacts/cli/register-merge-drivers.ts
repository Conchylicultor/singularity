import {
  spawnCaptured,
  spawnExpectOk,
} from "@plugins/infra/plugins/spawn/core";

// Wedge-breaker for the local `git` metadata reads in this file — orders of
// magnitude above what any of them take, so only a wedged child trips it. A CLI
// process owns no deadline of its own, but that is a reason to bound these, not
// to leave them open: nothing else would ever break such a wedge (the
// fleet-level op-wedge watchdog was retired 2026-07-28).
const GIT_TIMEOUT_MS = 60_000;

interface Driver {
  name: string;
  script: string;
}

const DRIVERS: Driver[] = [
  {
    name: "regen-generated",
    script: "plugins/framework/plugins/cli/scripts/regen-generated.sh",
  },
  {
    name: "regen-claudemd",
    script: "plugins/framework/plugins/cli/scripts/regen-claudemd.sh",
  },
  {
    name: "regen-migrations",
    script: "plugins/framework/plugins/cli/scripts/regen-migrations.sh",
  },
];

const STALE_DRIVERS = ["regen-docs"];

async function gitConfigGet(key: string, cwd: string): Promise<string | null> {
  const result = await spawnCaptured(
    ["git", "config", "--local", "--get", key],
    {
      cwd,
      timeoutMs: GIT_TIMEOUT_MS,
    },
  );
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

async function gitConfigSet(
  key: string,
  value: string,
  cwd: string,
): Promise<void> {
  await spawnExpectOk(["git", "config", "--local", key, value], {
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
  });
}

/**
 * Idempotently install custom merge drivers used by .gitattributes to
 * auto-resolve conflicts in deterministically-generated files (codegen
 * registries, docs, config origins, drizzle migrations) during
 * `git rebase` in `./singularity push`.
 *
 * Drivers themselves are trivial — they accept the upstream side. The
 * canonicalization happens in the post-rebase normalize step in `push.ts`,
 * which regenerates the artifacts from the rebased source tree.
 */
export async function registerMergeDrivers(root: string): Promise<void> {
  for (const d of DRIVERS) {
    const key = `merge.${d.name}.driver`;
    const want = `${d.script} %O %A %B %P`;
    const current = await gitConfigGet(key, root);
    if (current === want) continue;
    await gitConfigSet(key, want, root);
    console.log(`Registered merge driver: ${d.name}`);
  }
  for (const name of STALE_DRIVERS) {
    const key = `merge.${name}.driver`;
    if (await gitConfigGet(key, root)) {
      await spawnExpectOk(["git", "config", "--local", "--unset", key], {
        cwd: root,
        timeoutMs: GIT_TIMEOUT_MS,
      });
      console.log(`Removed stale merge driver: ${name}`);
    }
  }
}
