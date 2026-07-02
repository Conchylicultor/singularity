import { join } from "node:path";
import { GIT } from "@plugins/infra/plugins/paths/server";
import {
  ensureMainWorktreeRoot,
  removeWorktree,
  withWorktreeMutateSlot,
} from "@plugins/infra/plugins/worktree/server";
import type { StagedConfigDefault } from "../../core/resources";
import { findPromotableDescriptor } from "./registry-lookup";
import { writeGitLayerOverride } from "./git-layer-writer";

/** A staged row identified by its composite key. */
export interface LandedKey {
  pluginId: string;
  configName: string;
}

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
 * Land staged "default for everyone" config edits directly on `main`.
 *
 * Decoupled from whichever checkout staged the rows: spins up a throwaway git
 * worktree off `main`, writes the committed `config/<plugin>/<configName>.jsonc`
 * override for each (valid) row there, then reuses `./singularity push` inside
 * that worktree to ride the standard checks + merge-to-main + push flow (no
 * `--from-main`). The throwaway worktree is always removed afterward — awaited
 * loudly on success (a removal failure is a real bug → crash report), best-effort
 * on a landing error (so cleanup never masks the root cause).
 *
 * Per row: the descriptor must still be registered AND promotable, and the full
 * `value` document must pass the descriptor schema. Malformed / non-promotable
 * rows are skipped + logged — never written — so one bad row never blocks the
 * rest or commits a broken tree. A skipped row stays staged (the caller drains
 * only the returned, landed keys; see land-job.ts).
 *
 * Returns the composite keys that were actually written + pushed (excludes
 * skipped rows). An empty result means nothing was pushed.
 */
export async function landDefaults(
  rows: StagedConfigDefault[],
): Promise<LandedKey[]> {
  const repoRoot = await ensureMainWorktreeRoot();
  const ts = Date.now();
  const slug = `config-land-${ts}`;
  const branch = slug;
  const wtPath = join(repoRoot, ".claude/worktrees", slug);

  // Gate the heavy checkout host-wide alongside every other worktree add/remove, so
  // the invariant holds for this second inline `git worktree add` too (the `git`
  // helper still throws loudly on a nonzero exit — the throw propagates out of the
  // slot, which releases in a finally).
  await withWorktreeMutateSlot(() =>
    git(repoRoot, "worktree", "add", "-b", branch, wtPath, "main"),
  );

  const landed: LandedKey[] = [];

  try {
    for (const row of rows) {
      const descriptor = findPromotableDescriptor(row.pluginId, row.configName);
      if (!descriptor) {
        console.error(
          `[config-v2.land] skipping ${row.pluginId}/${row.configName}: ` +
            `descriptor not registered or not promotable to git.`,
        );
        continue;
      }
      const parsed = descriptor.schema.safeParse(row.value);
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
        console.error(
          `[config-v2.land] skipping malformed staged default for ` +
            `${row.pluginId}/${row.configName}: ${detail}`,
        );
        continue;
      }
      writeGitLayerOverride(wtPath, {
        pluginId: row.pluginId,
        configName: row.configName,
        value: row.value,
      });
      landed.push({ pluginId: row.pluginId, configName: row.configName });
    }

    if (landed.length === 0) {
      console.error("[config-v2.land] no valid staged defaults to land.");
    } else {
      await git(wtPath, "add", "-A");

      const msg =
        landed.length === 1
          ? "feat(config): land staged 'default for everyone' override"
          : `feat(config): land ${landed.length} staged 'default for everyone' overrides`;

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
