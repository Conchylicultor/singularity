const GIT = "/usr/bin/git";

export async function runGit(
  args: string[],
  cwd: string,
): Promise<string | null> {
  const proc = Bun.spawn([GIT, "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  return code === 0 ? out : null;
}
