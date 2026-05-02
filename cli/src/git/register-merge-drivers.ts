interface Driver {
  name: string;
  script: string;
}

const DRIVERS: Driver[] = [
  { name: "regen-docs", script: "cli/git-merge-drivers/regen-docs.sh" },
  { name: "regen-claudemd", script: "cli/git-merge-drivers/regen-claudemd.sh" },
  { name: "regen-migrations", script: "cli/git-merge-drivers/regen-migrations.sh" },
];

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
 * auto-resolve conflicts in deterministically-generated files (docs,
 * drizzle migrations) during `git rebase` in `./singularity push`.
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
}
