import type { Command } from "commander";
import { dlopen } from "bun:ffi";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync } from "fs";
import { join } from "path";
import { SINGULARITY_DIR } from "../paths";
import { checkBroadcasts } from "../broadcasts";

async function run(
  cmd: string[],
  cwd?: string,
): Promise<{ stdout: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "inherit",
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), exitCode };
}

async function exec(cmd: string[], cwd?: string): Promise<void> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    process.exit(1);
  }
}

// Spawns a fresh process so checks see the post-rebase code on disk,
// not the stale module cache from process start.
async function runChecksSubprocess(root: string): Promise<boolean> {
  const proc = Bun.spawn(["bun", "cli/src/index.ts", "check"], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  return (await proc.exited) === 0;
}

async function getWorktreeRoot(): Promise<string> {
  const { stdout } = await run(["git", "rev-parse", "--show-toplevel"]);
  if (!stdout) {
    console.error("Not in a git repository");
    process.exit(1);
  }
  return stdout;
}

async function getGitDir(): Promise<string> {
  const { stdout } = await run(["git", "rev-parse", "--git-dir"]);
  if (!stdout) {
    console.error("Not in a git repository");
    process.exit(1);
  }
  return stdout;
}

const CONFLICT_MARKER_RE = /^(<{7}|={7}|>{7}) /m;

function findClaudeMdConflicts(root: string): string[] {
  const offenders: string[] = [];
  const pluginsDir = join(root, "plugins");
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
      } else if (e === "CLAUDE.md") {
        const txt = readFileSync(full, "utf8");
        if (CONFLICT_MARKER_RE.test(txt)) offenders.push(full);
      }
    }
  };
  walk(pluginsDir);
  return offenders;
}

/**
 * Post-rebase normalize. Runs only if the rebase's custom merge drivers
 * (.gitattributes) actually fired — they drop marker files in
 * .git/singularity-merge-markers/ when invoked. Without conflicts, this is
 * a no-op and the agent's commits land unchanged.
 *
 * On a marker hit, we re-derive canonical content from the rebased source
 * tree and amend the head commit:
 *   - migrations marker: regen-migrations runs the hand-edit detector first
 *     (aborts loudly if any branch-local .sql was hand-edited), then resets
 *     branch-local files and re-runs drizzle-kit generate.
 *   - docs marker: regen-docs rewrites all autogen blocks (incl. inside
 *     CLAUDE.md files), erasing any benign autogen-only conflict markers left
 *     by regen-claudemd. We then scan plugins/**\/CLAUDE.md for residual
 *     conflict markers — those would be in hand-written prose, a real
 *     conflict the agent must resolve.
 */
async function postRebaseNormalize(root: string, pushId: string): Promise<void> {
  const gitDir = await getGitDir();
  // git-dir may be relative to cwd (".git") or absolute; resolve via cwd.
  const markerDir = gitDir.startsWith("/") ? join(gitDir, "singularity-merge-markers") : join(root, gitDir, "singularity-merge-markers");
  const migrationsMarker = join(markerDir, "migrations");
  const docsMarker = join(markerDir, "docs");
  const ranMigrations = existsSync(migrationsMarker);
  const ranDocs = existsSync(docsMarker);

  if (!ranMigrations && !ranDocs) return; // clean rebase, no auto-resolve happened

  console.log("Normalizing artifacts auto-resolved during rebase...");

  if (ranMigrations) {
    await exec(["bun", "cli/src/index.ts", "regen-migrations"], root);
    rmSync(migrationsMarker, { force: true });
  }

  if (ranDocs) {
    await exec(["bun", "cli/src/index.ts", "regen-docs"], root);
    rmSync(docsMarker, { force: true });

    const conflicted = findClaudeMdConflicts(root);
    if (conflicted.length) {
      console.error(
        [
          "",
          "Real merge conflict in plugin CLAUDE.md prose section(s):",
          ...conflicted.map((f) => `  ${f}`),
          "",
          "These are hand-written and require manual resolution. Edit the files,",
          "remove the conflict markers, then re-run ./singularity push.",
        ].join("\n"),
      );
      process.exit(1);
    }
  }

  const { stdout: dirty } = await run(["git", "status", "--porcelain"], root);
  if (!dirty) return;
  console.log("Amending head commit with regenerated artifacts...");
  await exec(["git", "add", "-A"], root);
  await exec(
    [
      "git",
      "-c",
      "trailer.ifexists=replace",
      "commit",
      "--amend",
      "--no-edit",
      "--trailer",
      `Singularity-Push=${pushId}`,
    ],
    root,
  );
}

async function getMainWorktree(): Promise<string> {
  const { stdout } = await run(["git", "worktree", "list", "--porcelain"]);
  // First worktree listed is always the main one
  const match = stdout.match(/^worktree (.+)$/m);
  if (!match) {
    console.error("Could not determine main worktree");
    process.exit(1);
  }
  return match[1];
}

async function getCurrentBranch(): Promise<string> {
  const { stdout, exitCode } = await run([
    "git",
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]);
  if (exitCode !== 0 || !stdout) {
    console.error("Could not determine current branch");
    process.exit(1);
  }
  return stdout;
}

const PUSH_LOCK_PATH = join(SINGULARITY_DIR, "push.lock");

const { symbols: ffi } = dlopen(
  process.platform === "darwin" ? "libc.dylib" : "libc.so.6",
  { flock: { args: ["i32", "i32"], returns: "i32" } },
);
const LOCK_EX = 2;
const LOCK_NB = 4;

async function withPushLock<T>(fn: () => Promise<T>): Promise<T> {
  mkdirSync(SINGULARITY_DIR, { recursive: true });
  const fd = openSync(PUSH_LOCK_PATH, "w");
  try {
    // Try non-blocking first to detect contention
    const nb = ffi.flock(fd, LOCK_EX | LOCK_NB);
    if (nb !== 0) {
      console.log("Another push is in progress — waiting for lock...");
      ffi.flock(fd, LOCK_EX);
      console.log("Lock acquired, proceeding.");
    }
    return await fn();
  } finally {
    closeSync(fd);
  }
}

export function registerPush(program: Command) {
  program
    .command("push")
    .description("Commit (if -m provided), merge into main, and push")
    .option("-m, --message <msg>", "Commit message — stages and commits all changes before pushing")
    .option(
      "--from-main",
      "DANGER: commit and push directly from main, bypassing the worktree-merge flow. " +
        "Agents MUST NOT pass this flag without explicit user approval in the current conversation. " +
        "Intended only when a human is driving and the worktree detour would be pure churn " +
        "(e.g. small fixes already staged on main). Still runs checks.",
    )
    .action(async (opts: {
      message?: string;
      fromMain?: boolean;
    }) => {
      const branch = await getCurrentBranch();
      const onMain = branch === "main";

      await checkBroadcasts("push");

      // Clear stale merge-driver markers from any previous failed push.
      const root0 = await getWorktreeRoot();
      const gitDir0 = await getGitDir();
      const markerDir0 = gitDir0.startsWith("/") ? join(gitDir0, "singularity-merge-markers") : join(root0, gitDir0, "singularity-merge-markers");
      rmSync(markerDir0, { recursive: true, force: true });

      // One push id per invocation; every commit that lands on main as part of
      // this push gets stamped with it (via `git commit --trailer` for the
      // --from-main path, and via `git rebase --exec` for the worktree path).
      // Watchers on every namespace read the trailer to group commits into a
      // single push event.
      const pushId = crypto.randomUUID();

      if (onMain && !opts.fromMain) {
        console.error("Already on main — nothing to merge.");
        process.exit(1);
      }
      if (opts.fromMain && !onMain) {
        console.error(`--from-main requires being on main (currently on ${branch}).`);
        process.exit(1);
      }
      // 1. Commit if -m provided, otherwise require clean tree
      const { stdout: status } = await run(["git", "status", "--porcelain"]);
      if (opts.message) {
        if (status) {
          const files = status.split("\n").map((l) => l.trim());
          console.log(`Committing ${files.length} file(s)${opts.fromMain ? " on main" : ""}:`);
          for (const f of files) console.log(`  ${f}`);
          await exec(["git", "add", "-A"]);
          await exec(["git", "commit", "-m", opts.message]);
        } else {
          console.log("No files to commit.");
        }
      } else if (status) {
        console.error(
          'Missing `-m "commit message"` flag. You have uncommitted changes.',
        );
        process.exit(1);
      }

      // --from-main: rebase onto origin/main and push. No worktree merge.
      // Split fetch + rebase because `git pull --rebase --exec` isn't a valid
      // flag combination on Apple Git (the --exec doesn't propagate to rebase).
      if (opts.fromMain) {
        await withPushLock(async () => {
          console.log("Pulling main...");
          await exec(["git", "fetch", "origin", "main"]);
          await exec([
            "git",
            "rebase",
            "origin/main",
            "--exec",
            `git -c trailer.ifexists=replace commit --amend --no-edit --trailer Singularity-Push=${pushId}`,
          ]);
          const fromMainRoot = await getWorktreeRoot();
          await postRebaseNormalize(fromMainRoot, pushId);
          console.log("Running checks...");
          const ok = await runChecksSubprocess(fromMainRoot);
          if (!ok) {
            console.error(
              "Checks failed after rebase. Fix the issue and re-run ./singularity push " +
                "(your commit is still on HEAD; use `git reset --soft HEAD~1` to unstage it if needed).",
            );
            process.exit(1);
          }
          console.log("Pushing main...");
          await exec(["git", "push"]);
        });
        console.log("Done. Pushed directly from main.");
        return;
      }

      // Steps 2–7 touch the shared main worktree and must be serialized
      // across all concurrent agents. The flock is held for the entire
      // critical section so no two pushes can race on main.
      const mainWorktree = await getMainWorktree();
      await withPushLock(async () => {
        // 2. Pull main to ensure it's up to date before merging.
        // Use explicit fetch + merge instead of `git pull --ff-only` because FETCH_HEAD
        // is shared across all worktrees; a prior fetch in another worktree can leave
        // multiple "for-merge" entries, causing "Cannot fast-forward to multiple branches".
        console.log("Pulling main...");
        await exec(["git", "fetch", "origin", "main"], mainWorktree);
        await exec(["git", "merge", "--ff-only", "origin/main"], mainWorktree);

        // 3. Rebase onto main so the merge is always a fast-forward. `--exec`
        //    runs after each replayed commit, amending it to carry a shared
        //    Singularity-Push trailer so the server can group all commits in
        //    this push as a single event.
        const { exitCode: rebaseExit } = await run([
          "git",
          "rebase",
          "main",
          "--exec",
          `git -c trailer.ifexists=replace commit --amend --no-edit --trailer Singularity-Push=${pushId}`,
        ]);
        if (rebaseExit !== 0) {
          await run(["git", "rebase", "--abort"]);
          console.error(
            [
              `Rebase of ${branch} onto main failed (aborted).`,
              ``,
              `Conflicts during this rebase are routine when main has moved — resolve them yourself, don't bail out.`,
              ``,
              `To resolve:`,
              `  1. git fetch origin main`,
              `  2. git rebase origin/main     (NEVER 'git merge' — push re-rebases and a merge commit produces churn)`,
              `  3. Resolve conflicts, then 'git add <files>' and 'git rebase --continue'`,
              `     (or 'git rebase --abort' to bail out)`,
              `  4. Re-run ./singularity push`,
              ``,
              `If main's shape has diverged enough that your commit no longer makes sense,`,
              `'git reset --hard origin/main' + reapply as a fresh commit is cleaner than rebasing.`,
            ].join("\n"),
          );
          process.exit(1);
        }

        // 3b. Post-rebase normalize: regenerate auto-generated artifacts
        //     (docs, drizzle migrations) from the rebased source tree and
        //     amend the head commit. The merge drivers in .gitattributes
        //     accepted the upstream side during the rebase; this step makes
        //     the final commit canonical. Aborts on hand-edited migrations
        //     or on real conflict markers in CLAUDE.md prose.
        await postRebaseNormalize(await getWorktreeRoot(), pushId);

        // 4. Run checks on the rebased tree — this is exactly what will land on main.
        //    Spawned as a subprocess so the check code comes from the rebased
        //    tree, not the (potentially stale) module cache of this process.
        console.log("Running checks...");
        const root = await getWorktreeRoot();
        const ok = await runChecksSubprocess(root);
        if (!ok) {
          console.error(
            `Checks failed after rebasing ${branch} onto main. ` +
              `Fix the issue and re-run ./singularity push ` +
              `(your commits are on ${branch}; use \`git reset --soft HEAD~1\` to unstage the last one if needed).`,
          );
          process.exit(1);
        }

        // 5. Push the branch (force since rebase rewrites history — safe for single-owner worktree branches)
        console.log(`Pushing branch ${branch}...`);
        await exec(["git", "push", "--force-with-lease", "-u", "origin", branch]);

        // 6. Fast-forward merge into main (guaranteed to succeed — we hold the
        //    lock, so no other push can have advanced main since our rebase).
        console.log(`Merging ${branch} into main...`);
        await exec(["git", "merge", "--ff-only", branch], mainWorktree);

        // 7. Push main
        console.log("Pushing main...");
        await exec(["git", "push"], mainWorktree);
      });

      console.log(`Done. ${branch} merged into main and pushed.`);
    });
}
