interface Driver {
  name: string;
  script: string;
}

const DRIVERS: Driver[] = [
  { name: "regen-generated", script: "plugins/framework/plugins/cli/scripts/regen-generated.sh" },
  { name: "regen-claudemd", script: "plugins/framework/plugins/cli/scripts/regen-claudemd.sh" },
  { name: "regen-migrations", script: "plugins/framework/plugins/cli/scripts/regen-migrations.sh" },
];

const STALE_DRIVERS = ["regen-docs"];

async function gitConfigGet(key: string, cwd: string): Promise<string | null> {
  const proc = Bun.spawn(["git", "config", "--local", "--get", key], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  return code === 0 ? out.trim() : null;
}

async function gitConfigSet(key: string, value: string, cwd: string): Promise<void> {
  const proc = Bun.spawn(["git", "config", "--local", key, value], {
    cwd,
    stdout: "pipe",
    stderr: "inherit",
  });
  if ((await proc.exited) !== 0) {
    throw new Error(`Failed to set git config ${key}`);
  }
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
      const proc = Bun.spawn(["git", "config", "--local", "--unset", key], { cwd: root, stdout: "pipe", stderr: "pipe" });
      await proc.exited;
      console.log(`Removed stale merge driver: ${name}`);
    }
  }
}
