import { join } from "node:path";
import { GIT } from "@plugins/infra/plugins/paths/server";
import {
  ensureMainWorktreeRoot,
  removeWorktree,
} from "@plugins/infra/plugins/worktree/server";
import { reorderDirectiveDescriptor } from "@plugins/reorder/server";
import type { StagedReorderDefault } from "../../shared/resources";
import { writeGitLayerOverride } from "./git-layer-writer";

// Run a git command in `dir`; throw loudly (with stderr) on a non-zero exit.
async function git(dir: string, ...args: string[]): Promise<void> {
  const proc = Bun.spawn([GIT, "-C", dir, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(" ")} failed in ${dir}: ${err}`);
  }
}

/**
 * Land staged "default for everyone" reorder edits directly on `main`.
 *
 * Decoupled from whichever checkout staged the rows: spins up a throwaway git
 * worktree off `main`, writes the committed `config/<plugin>/<slot>.jsonc`
 * override for each (valid) row there, then reuses `./singularity push` inside
 * that worktree to ride the standard checks + merge-to-main + push flow (no
 * `--from-main`). The throwaway worktree is always removed afterward — awaited
 * loudly on success (a removal failure is a real bug → crash report), best-effort
 * on a landing error (so cleanup never masks the root cause).
 *
 * Malformed rows (legacy `{order,hidden}` shapes, etc.) are skipped + logged —
 * never written — so one bad row never blocks the rest or commits a broken
 * tree. A bad row stays staged (the caller drains only the returned, landed
 * slotIds; see land-job.ts).
 *
 * Returns the slotIds that were actually written + pushed (excludes skipped
 * malformed rows). An empty result means nothing was pushed.
 */
export async function landDefaults(
  rows: StagedReorderDefault[],
): Promise<string[]> {
  const repoRoot = await ensureMainWorktreeRoot();
  const ts = Date.now();
  const slug = `reorder-land-${ts}`;
  const branch = slug;
  const wtPath = join(repoRoot, ".claude/worktrees", slug);

  await git(repoRoot, "worktree", "add", "-b", branch, wtPath, "main");

  const landed: string[] = [];

  try {
    for (const row of rows) {
      const descriptor = reorderDirectiveDescriptor(row.slotId);
      const parsed = descriptor.schema.safeParse({ items: row.items });
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
        console.error(
          `[reorder.land] skipping malformed staged default for ${row.slotId}: ${detail}`,
        );
        continue;
      }
      writeGitLayerOverride(wtPath, {
        slotId: row.slotId,
        pluginId: row.pluginId,
        items: row.items as unknown[],
      });
      landed.push(row.slotId);
    }

    if (landed.length === 0) {
      console.error("[reorder.land] no valid staged defaults to land.");
    } else {
      await git(wtPath, "add", "-A");

      const msg =
        landed.length === 1
          ? "feat(reorder): land staged 'default for everyone' override"
          : `feat(reorder): land ${landed.length} staged 'default for everyone' overrides`;

      const push = Bun.spawn(["./singularity", "push", "-m", msg], {
        cwd: wtPath,
        stdout: "pipe",
        stderr: "pipe",
      });
      await push.exited;
      if (push.exitCode !== 0) {
        const out = await new Response(push.stdout).text();
        const err = await new Response(push.stderr).text();
        throw new Error(
          `./singularity push failed (exit ${push.exitCode}) in ${wtPath}:\n${err}\n${out}`,
        );
      }
    }
  } catch (landErr) {
    // Landing failed: attempt cleanup, but throw the landing error (the root
    // cause) rather than letting a cleanup failure mask it. A cleanup failure
    // here still surfaces as an unhandled rejection the reports plugin files.
    void removeWorktree(wtPath);
    throw landErr;
  }

  // Landing succeeded: the throwaway worktree MUST remove cleanly. If it can't,
  // that's a genuine bug — await it loudly so it files a crash report instead of
  // silently leaking a worktree.
  await removeWorktree(wtPath);
  return landed;
}
