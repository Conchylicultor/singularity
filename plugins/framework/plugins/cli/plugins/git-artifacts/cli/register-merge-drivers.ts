import {
  gitConfigGet,
  gitConfigSet,
  gitConfigUnset,
} from "@plugins/infra/plugins/git/plugins/remotes/core";

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
      await gitConfigUnset(key, root);
      console.log(`Removed stale merge driver: ${name}`);
    }
  }
}
