/**
 * Unit coverage for the broadened orphan-reconcile close condition.
 *
 * `reconcileOrphanBuilds` binds the module-level `db` singleton and so — like the
 * page/editor `parent-liveness` suite — cannot be pointed at a fixture DB. But its
 * per-row close DECISION is fully determined by two pure, db-free functions:
 *
 *   close?  =  !(readBuildTerminal(id) == null && isPidAlive(pid))
 *   value   =  readBuildTerminal(id) ?? { exitCode: -1, finishedAt: now }
 *
 * So covering `readBuildTerminal` (against real on-disk artifacts at the real
 * resolved path) and `isPidAlive` (against real processes) exercises exactly the
 * three plan scenarios:
 *
 *   - artifact present w/ finishedAt, pid alive ⇒ terminal != null ⇒ CLOSE from
 *     the artifact's recovered {exitCode, finishedAt}.
 *   - no artifact, pid dead ⇒ terminal == null && !alive ⇒ CLOSE with {-1, now}.
 *   - no artifact, pid alive (running build) ⇒ terminal == null && alive ⇒ LEAVE OPEN.
 *
 * Run: `bun test plugins/build/server/internal/run-build.test.ts`
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  currentWorktreeName,
  worktreeArtifacts,
  worktreeDataDir,
} from "@plugins/infra/plugins/paths/server";
import {
  isPidAlive,
  needsRebuild,
  readBuildTerminal,
  recoverBuildArtifacts,
} from "./run-build";

const name = currentWorktreeName();
const created: string[] = [];

function writeArtifact(buildId: string, body: unknown): void {
  mkdirSync(worktreeDataDir(name), { recursive: true });
  const path = worktreeArtifacts.buildLogs(name, buildId);
  writeFileSync(path, JSON.stringify(body) + "\n");
  created.push(path);
}

function uniqueBuildId(tag: string): string {
  return `test-${tag}-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

afterEach(() => {
  for (const path of created.splice(0)) {
    if (existsSync(path)) rmSync(path);
  }
});

describe("readBuildTerminal", () => {
  test("all-green steps + finishedAt ⇒ exit 0 at the recorded instant", () => {
    const finishedAt = Date.now() - 12_345;
    const buildId = uniqueBuildId("ok");
    writeArtifact(buildId, {
      steps: [{ success: true }, { success: true }],
      finishedAt,
    });
    expect(readBuildTerminal(buildId)).toEqual({
      exitCode: 0,
      finishedAt: new Date(finishedAt),
    });
  });

  test("a failed step + finishedAt ⇒ exit 1 at the recorded instant", () => {
    const finishedAt = Date.now() - 999;
    const buildId = uniqueBuildId("fail");
    writeArtifact(buildId, {
      steps: [{ success: true }, { success: false }],
      finishedAt,
    });
    expect(readBuildTerminal(buildId)).toEqual({
      exitCode: 1,
      finishedAt: new Date(finishedAt),
    });
  });

  test("no artifact (ENOENT) ⇒ null (no terminal signal)", () => {
    // A build id whose artifact was never written.
    expect(readBuildTerminal(uniqueBuildId("absent"))).toBeNull();
  });

  test("unparseable artifact ⇒ null", () => {
    const buildId = uniqueBuildId("garbage");
    mkdirSync(worktreeDataDir(name), { recursive: true });
    const path = worktreeArtifacts.buildLogs(name, buildId);
    writeFileSync(path, "{ not json");
    created.push(path);
    expect(readBuildTerminal(buildId)).toBeNull();
  });

  test("empty steps and no exitCode ⇒ null (nothing to read an outcome from)", () => {
    const buildId = uniqueBuildId("nosteps");
    writeArtifact(buildId, { steps: [], finishedAt: Date.now() });
    expect(readBuildTerminal(buildId)).toBeNull();
  });

  test("steps present but no finishedAt ⇒ null (no recorded terminal instant)", () => {
    const buildId = uniqueBuildId("nofin");
    writeArtifact(buildId, { steps: [{ success: true }] });
    expect(readBuildTerminal(buildId)).toBeNull();
  });

  test("an explicit exitCode wins over the step derivation", () => {
    const finishedAt = Date.now() - 42;
    const buildId = uniqueBuildId("explicit");
    writeArtifact(buildId, {
      steps: [{ success: false }],
      finishedAt,
      exitCode: 2,
    });
    expect(readBuildTerminal(buildId)).toEqual({
      exitCode: 2,
      finishedAt: new Date(finishedAt),
    });
  });

  test("a partial ALL-GREEN step list with exitCode 143 reads as killed, not success", () => {
    // The regression this field exists for. A build killed mid-step has closed
    // only the steps that finished — every one of them green — so the old
    // `steps.every(s => s.success)` derivation would call a SIGTERM a clean
    // deploy, and the run's badge would read succeeded.
    const finishedAt = Date.now() - 7;
    const buildId = uniqueBuildId("killed");
    writeArtifact(buildId, {
      steps: [{ success: true }, { success: true }],
      finishedAt,
      exitCode: 143,
    });
    expect(readBuildTerminal(buildId)).toEqual({
      exitCode: 143,
      finishedAt: new Date(finishedAt),
    });
  });

  test("a zero-step abort is terminal once it carries an exitCode", () => {
    // Killed before any step closed: nothing to derive from, but the artifact
    // says what happened, so the row can close at the real code and instant
    // rather than the -1/now sentinel.
    const finishedAt = Date.now() - 3;
    const buildId = uniqueBuildId("zerostep");
    writeArtifact(buildId, { steps: [], finishedAt, exitCode: 143 });
    expect(readBuildTerminal(buildId)).toEqual({
      exitCode: 143,
      finishedAt: new Date(finishedAt),
    });
  });
});

/**
 * The SIGKILL backstop. It is the only writer left for a build that ran no exit
 * handler at all, and the verdict such a build printed (if it printed one) names
 * BOTH files — so writing one of the two is what left a pointer dangling.
 */
describe("recoverBuildArtifacts", () => {
  const lines: Array<{ text: string; stream: "stdout" | "stderr" }> = [
    { text: "Restarting backend...", stream: "stdout" },
    { text: "boom", stream: "stderr" },
  ];

  function recover(
    buildId: string,
    exitCode: number,
    finishedAt: Date,
  ): [string, string] {
    const paths: [string, string] = [
      worktreeArtifacts.buildLogs(name, buildId),
      worktreeArtifacts.buildLogText(name, buildId),
    ];
    created.push(...paths);
    recoverBuildArtifacts({
      worktree: name,
      buildId,
      lines,
      durationMs: 4_000,
      finishedAt,
      exitCode,
    });
    return paths;
  }

  test("writes BOTH artifacts — the json AND the text log a verdict points at", () => {
    const [jsonPath, textPath] = recover(
      uniqueBuildId("both"),
      137,
      new Date(),
    );
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(textPath)).toBe(true);
  });

  test("the text log replays the captured output verbatim under a recovered header", () => {
    const [, textPath] = recover(uniqueBuildId("text"), 137, new Date());
    const text = readFileSync(textPath, "utf-8");
    expect(text.split("\n")[0]).toContain("recovered by the backend");
    for (const { text: line } of lines) expect(text).toContain(line);
  });

  test("readBuildTerminal reads back the exact code and instant the row is stamped with", () => {
    // The property the whole helper is for: the artifact and the build_runs row
    // are written from one value, so a later reconcile cannot contradict them.
    const buildId = uniqueBuildId("roundtrip");
    const finishedAt = new Date(Date.now() - 1_000);
    recover(buildId, 143, finishedAt);
    expect(readBuildTerminal(buildId)).toEqual({ exitCode: 143, finishedAt });
  });

  test("never overwrites an artifact the CLI already wrote", () => {
    const buildId = uniqueBuildId("noclobber");
    mkdirSync(worktreeDataDir(name), { recursive: true });
    const jsonPath = worktreeArtifacts.buildLogs(name, buildId);
    const textPath = worktreeArtifacts.buildLogText(name, buildId);
    writeFileSync(
      jsonPath,
      JSON.stringify({ steps: [], finishedAt: 1, exitCode: 0 }) + "\n",
    );
    writeFileSync(textPath, "the CLI's own transcript\n");
    created.push(jsonPath, textPath);
    recoverBuildArtifacts({
      worktree: name,
      buildId,
      lines,
      durationMs: 1,
      finishedAt: new Date(),
      exitCode: 137,
    });
    expect(readBuildTerminal(buildId)).toEqual({
      exitCode: 0,
      finishedAt: new Date(1),
    });
    expect(readFileSync(textPath, "utf-8")).toBe("the CLI's own transcript\n");
  });
});

describe("isPidAlive", () => {
  test("null pid ⇒ dead", () => {
    expect(isPidAlive(null)).toBe(false);
  });

  test("own pid ⇒ alive", () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  test("a reaped child pid ⇒ dead", async () => {
    const proc = Bun.spawn(["true"]);
    const childPid = proc.pid;
    await proc.exited; // reaped ⇒ ESRCH on the subsequent probe
    expect(isPidAlive(childPid)).toBe(false);
  });
});

describe("reconcile close condition (composition)", () => {
  // Mirrors the exact per-row rule in reconcileOrphanBuilds, driven by the real
  // readBuildTerminal / isPidAlive outputs, so the three plan scenarios are
  // asserted end-to-end without a fixture DB.
  const now = new Date();
  function decide(
    buildId: string,
    pid: number | null,
  ): { exitCode: number; finishedAt: Date } | "leave-open" {
    const terminal = readBuildTerminal(buildId);
    if (terminal == null && isPidAlive(pid)) return "leave-open";
    return terminal ?? { exitCode: -1, finishedAt: now };
  }

  test("artifact present but pid alive ⇒ closes from the artifact record", () => {
    const finishedAt = Date.now() - 5_000;
    const buildId = uniqueBuildId("closealive");
    writeArtifact(buildId, { steps: [{ success: true }], finishedAt });
    expect(decide(buildId, process.pid)).toEqual({
      exitCode: 0,
      finishedAt: new Date(finishedAt),
    });
  });

  test("no artifact + pid dead ⇒ closes with the -1/now sentinel", () => {
    expect(decide(uniqueBuildId("closedead"), null)).toEqual({
      exitCode: -1,
      finishedAt: now,
    });
  });

  test("running build (no artifact, pid alive) ⇒ left open", () => {
    expect(decide(uniqueBuildId("running"), process.pid)).toBe("leave-open");
  });
});

/**
 * `convergeMain` re-derives the dropped auto-build request rather than
 * remembering it, so it runs after EVERY build — which makes "does it ever
 * re-trigger itself without end" the property that matters. Its decision is the
 * pure `needsRebuild`, so the whole loop question is decidable here.
 */
describe("needsRebuild — the convergence decision", () => {
  test("a build for the current tip does not re-trigger", () => {
    // The failure loop this exists to prevent: a build that FAILED never updates
    // the deployed commit, so a deployed-vs-head test would rebuild the same
    // failing commit for ever. Comparing against what the build was FOR does not.
    expect(needsRebuild("abc1234", "abc1234")).toBe(false);
  });

  test("a tree that moved during the build re-triggers", () => {
    expect(needsRebuild("abc1234", "def5678")).toBe(true);
  });

  test("the re-triggered build then converges — the chain terminates", () => {
    // Round 1 rebuilds at the new tip; round 2 is a build FOR that tip, so it
    // matches and stops. Termination after exactly one extra build.
    const head = "def5678";
    expect(needsRebuild("abc1234", head)).toBe(true);
    expect(needsRebuild(head, head)).toBe(false);
  });

  test("an unreadable commit on either side reads as converged, never as a difference", () => {
    expect(needsRebuild(null, "abc1234")).toBe(false);
    expect(needsRebuild("abc1234", null)).toBe(false);
    expect(needsRebuild(null, null)).toBe(false);
  });
});
