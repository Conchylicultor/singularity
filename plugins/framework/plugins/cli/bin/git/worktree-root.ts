export async function getWorktreeRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const raw = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  return raw;
}
