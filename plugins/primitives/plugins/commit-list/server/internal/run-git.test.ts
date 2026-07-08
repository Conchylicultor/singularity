import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitError, runGit, tryRunGit } from "./run-git";

// A real temp git repo with one commit, so success paths exercise real git output.
let repo: string;

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), "run-git-test-"));
  await runGit(["init", "-q"], repo);
  await runGit(["config", "user.email", "test@example.com"], repo);
  await runGit(["config", "user.name", "Test"], repo);
  await runGit(["commit", "-q", "--allow-empty", "-m", "initial"], repo);
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("runGit", () => {
  test("returns stdout on success", async () => {
    const out = await runGit(["rev-parse", "HEAD"], repo);
    expect(out.trim()).toMatch(/^[0-9a-f]{40}$/);
  });

  test("throws GitError with exitCode + stderr on a non-zero exit", async () => {
    let thrown: unknown;
    try {
      await runGit(["rev-parse", "--verify", "refs/heads/definitely-missing"], repo);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(GitError);
    const gitErr = thrown as GitError;
    expect(gitErr.exitCode).not.toBe(0);
    // The message carries the args + exit code so the failure is debuggable.
    expect(gitErr.message).toContain("rev-parse");
    expect(gitErr.args).toContain("--verify");
    expect(gitErr.cwd).toBe(repo);
  });
});

describe("tryRunGit", () => {
  test("returns ok:true with stdout on success", async () => {
    const res = await tryRunGit(["rev-parse", "HEAD"], repo);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.stdout.trim()).toMatch(/^[0-9a-f]{40}$/);
  });

  test("returns ok:false without throwing on a non-zero exit", async () => {
    const res = await tryRunGit(
      ["rev-parse", "--verify", "--quiet", "refs/heads/definitely-missing"],
      repo,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      // rev-parse --verify --quiet exits 1 for a genuinely-absent ref.
      expect(res.exitCode).toBe(1);
      expect(typeof res.stderr).toBe("string");
    }
  });
});
