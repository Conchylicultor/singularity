import { PS } from "@plugins/infra/plugins/paths/server";

/** Enumerates every live process as a (pid, ppid) pair. */
export type ProcessLister = () => Promise<Array<{ pid: number; ppid: number }>>;

/** Parent → direct children adjacency, from one point-in-time process snapshot. */
export interface ProcessTree {
  children: Map<number, number[]>;
  /**
   * Every pid in the same snapshot — the liveness oracle for pids reached
   * OUTSIDE the tree. A parked job's host is re-parented to launchd, so it is
   * found by scanning `~/.claude/sessions/` rather than by walking children;
   * without this set a leaked file from an exited host is indistinguishable
   * from a second live claimant of the same job.
   */
  pids: Set<number>;
}

async function psLister(): Promise<Array<{ pid: number; ppid: number }>> {
  const proc = Bun.spawn([PS, "-axo", "pid=,ppid="], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exit = await proc.exited;
  // An empty tree is indistinguishable from "this pid has no descendants", so a
  // failed snapshot must never degrade into one — it would silently re-introduce
  // the pane_pid-only resolution this module exists to replace.
  if (exit !== 0) {
    throw new Error(
      `ps -axo pid=,ppid= failed (exit ${exit}): ${stderr.trim() || "<no stderr>"}`,
    );
  }
  const rows: Array<{ pid: number; ppid: number }> = [];
  for (const line of stdout.split("\n")) {
    const [pidStr, ppidStr] = line.trim().split(/\s+/);
    if (!pidStr || !ppidStr) continue;
    const pid = Number(pidStr);
    const ppid = Number(ppidStr);
    if (!Number.isFinite(pid) || !Number.isFinite(ppid)) continue;
    rows.push({ pid, ppid });
  }
  return rows;
}

/**
 * One `ps` snapshot of the whole process table, indexed by parent.
 *
 * A single spawn per poller tick, rather than N recursive `pgrep -P` calls:
 * Claude Code can host a pane's live session several levels below `pane_pid`,
 * so resolution needs the full subtree, not one level of children.
 */
export async function captureProcessTree(
  lister: ProcessLister = psLister,
): Promise<ProcessTree> {
  const children = new Map<number, number[]>();
  const pids = new Set<number>();
  for (const { pid, ppid } of await lister()) {
    pids.add(pid);
    const siblings = children.get(ppid);
    if (siblings) siblings.push(pid);
    else children.set(ppid, [pid]);
  }
  return { children, pids };
}

/**
 * Breadth-first walk of `root`'s subtree, returning `[root, ...descendants]`.
 *
 * The seen-set guards against a snapshot that reports a cycle — `ps` samples
 * pids over time, so a reused pid can name itself its own ancestor.
 */
export function subtreePids(tree: ProcessTree, root: number): number[] {
  const seen = new Set<number>([root]);
  const out: number[] = [root];
  for (let i = 0; i < out.length; i++) {
    for (const child of tree.children.get(out[i]!) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      out.push(child);
    }
  }
  return out;
}
