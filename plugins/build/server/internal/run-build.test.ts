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
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { currentWorktreeName, worktreeArtifacts, worktreeDataDir } from "@plugins/infra/plugins/paths/server";
import { isPidAlive, readBuildTerminal } from "./run-build";

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

  test("empty steps ⇒ null (not a terminal record)", () => {
    const buildId = uniqueBuildId("nosteps");
    writeArtifact(buildId, { steps: [], finishedAt: Date.now() });
    expect(readBuildTerminal(buildId)).toBeNull();
  });

  test("steps present but no finishedAt ⇒ null (no recorded terminal instant)", () => {
    const buildId = uniqueBuildId("nofin");
    writeArtifact(buildId, { steps: [{ success: true }] });
    expect(readBuildTerminal(buildId)).toBeNull();
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
  function decide(buildId: string, pid: number | null): { exitCode: number; finishedAt: Date } | "leave-open" {
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
