import { getMainWorktreeRoot } from "@plugins/conversations/server/internal/tmux";

const GIT = "/usr/bin/git";
const TTL_MS = 30_000;

let cache: { expires: number; timestamps: string[] } | null = null;

export async function getCommitTimestamps(): Promise<string[]> {
  if (cache && cache.expires > Date.now()) return cache.timestamps;
  const root = await getMainWorktreeRoot();
  const proc = Bun.spawn([GIT, "-C", root, "log", "--format=%cI", "--reverse"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  const timestamps = text.split("\n").map((l) => l.trim()).filter(Boolean);
  cache = { expires: Date.now() + TTL_MS, timestamps };
  return timestamps;
}
