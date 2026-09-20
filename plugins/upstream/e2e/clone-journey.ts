/**
 * The clone user's git journey, end to end, against real repositories.
 *
 * Builds a throwaway upstream + clone under the OS temp dir and drives the real
 * `resolvePublishTarget` / `resolveUpstreamRemote` / `fetchUpstreamStatus`
 * against them, then takes two updates in a row — because the second one is
 * what proves the landing rule: an update must import upstream's own commits,
 * not copies of them, or every later update re-presents work already merged.
 *
 * It also asserts the author's case on THIS checkout: a checkout that may write
 * to its remote publishes as it always did and has no upstream. That one makes
 * a network call (a `--dry-run` push, which sends no update); everything else
 * is local filesystem repositories.
 *
 * Run: ./singularity run plugins/upstream/e2e/clone-journey.ts
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolvePublishTarget,
  resolveUpstreamRemote,
} from "@plugins/infra/plugins/git/plugins/remotes/core";
import {
  spawnCaptured,
  getWorktreeRoot,
} from "@plugins/infra/plugins/spawn/core";
import { fetchUpstreamStatus } from "@plugins/upstream/core";

const GIT_TIMEOUT_MS = 60_000;

let failures = 0;

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

/** Run git in `cwd`, exiting on failure: a broken fixture is not a test result. */
async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await spawnCaptured(["git", ...args], {
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t.t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t.t",
    },
  });
  if (result.exitCode !== 0) {
    console.error(`git ${args.join(" ")} failed in ${cwd}:\n${result.stderr}`);
    process.exit(1);
  }
  return result.stdout.trim();
}

/** Does `ref` sit in `branch`'s history — i.e. did that commit itself land? */
async function isAncestor(
  cwd: string,
  ref: string,
  branch: string,
): Promise<boolean> {
  const result = await spawnCaptured(
    ["git", "merge-base", "--is-ancestor", ref, branch],
    { cwd, timeoutMs: GIT_TIMEOUT_MS },
  );
  if (result.exitCode === 0) return true;
  if (result.exitCode === 1) return false;
  console.error(`merge-base --is-ancestor failed: ${result.stderr}`);
  process.exit(1);
}

async function commit(
  cwd: string,
  file: string,
  body: string,
  message: string,
): Promise<string> {
  writeFileSync(join(cwd, file), `${body}\n`);
  await git(cwd, "add", "-A");
  await git(cwd, "commit", "-m", message);
  return await git(cwd, "rev-parse", "HEAD");
}

async function main(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), "singularity-clone-journey-"));
  try {
    // --- the fixture: an upstream repo, and a clone of it whose only remote is
    // --- named `upstream` (the ordinary clone: nothing of its own to publish to).
    const upstream = join(tmp, "upstream");
    const clone = join(tmp, "clone");
    await git(tmp, "init", "-q", "-b", "main", upstream);
    await commit(upstream, "shared.txt", "base", "base");
    await git(tmp, "clone", "-q", upstream, clone);
    await git(clone, "remote", "rename", "origin", "upstream");

    console.log("\nA clone with nothing to publish to:");
    const target = await resolvePublishTarget(clone);
    check(
      "publishes nowhere",
      target.kind === "local",
      `got ${target.kind === "publish" ? `publish/${target.remote}` : ""}`,
    );
    const up = await resolveUpstreamRemote(clone);
    check(
      "receives from `upstream`",
      up.kind === "upstream" && up.remote === "upstream",
      JSON.stringify(up),
    );

    console.log("\nBefore upstream moves:");
    const current = await fetchUpstreamStatus(clone);
    check("is up to date", current.kind === "current", current.kind);

    // --- update #1: upstream moves, the clone merges it into a branch, and the
    // --- branch lands on main by fast-forward (what push does when main is an
    // --- ancestor). The user's own commit is there too, so the merge is real.
    await commit(clone, "mine.txt", "mine", "local: my own work");
    const upA = await commit(
      upstream,
      "shared.txt",
      "theirs",
      "upstream: first",
    );

    console.log("\nAfter upstream moves:");
    const behind = await fetchUpstreamStatus(clone);
    check(
      "reports behind by 1",
      behind.kind === "behind" && behind.count === 1,
      JSON.stringify(behind),
    );
    check(
      "names the newest commit",
      behind.kind === "behind" &&
        behind.newest[0]?.subject === "upstream: first",
      behind.kind === "behind" ? JSON.stringify(behind.newest) : behind.kind,
    );

    await git(clone, "checkout", "-q", "-b", "update-1", "main");
    await git(clone, "merge", "--no-edit", "upstream/main");
    await git(
      clone,
      "commit",
      "--amend",
      "--no-edit",
      "--trailer",
      "Singularity-Push=e2e-1",
    );
    await git(clone, "checkout", "-q", "main");
    await git(clone, "merge", "--ff-only", "update-1");

    console.log("\nAfter landing update 1:");
    check(
      "upstream's own commit is in main",
      await isAncestor(clone, upA, "main"),
      upA,
    );
    check(
      "the tip carries the push trailer",
      (
        await git(
          clone,
          "log",
          "-1",
          "--format=%(trailers:key=Singularity-Push,valueonly)",
          "main",
        )
      ).trim() === "e2e-1",
    );
    const settled = await fetchUpstreamStatus(clone);
    check("nothing is left behind", settled.kind === "current", settled.kind);

    // --- update #2: the one that would fail if update 1 had imported COPIES of
    // --- upstream's commits instead of upstream's commits.
    const upB = await commit(
      upstream,
      "second.txt",
      "more",
      "upstream: second",
    );
    const again = await fetchUpstreamStatus(clone);
    check(
      "only the new commit is behind",
      again.kind === "behind" && again.count === 1,
      JSON.stringify(again),
    );

    await git(clone, "checkout", "-q", "-b", "update-2", "main");
    const base = await git(clone, "merge-base", "main", "upstream/main");
    check(
      "the merge base is upstream's own last commit",
      base === upA,
      `${base} vs ${upA}`,
    );
    await git(clone, "merge", "--no-edit", "upstream/main");
    check(
      "update 2 merged without replaying update 1",
      await isAncestor(clone, upB, "HEAD"),
      upB,
    );

    // --- the author's case, on this checkout.
    console.log("\nThis checkout (the one that owns the repo):");
    const mine = await resolvePublishTarget(await getWorktreeRoot());
    check(
      "publishes to its remote",
      mine.kind === "publish",
      JSON.stringify(mine),
    );
    const mineUp = await resolveUpstreamRemote(await getWorktreeRoot());
    check(
      "has no upstream above it",
      mineUp.kind === "none" && mineUp.reason === "is-publisher",
      JSON.stringify(mineUp),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  console.log("");
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("All checks passed.");
}

await main();
