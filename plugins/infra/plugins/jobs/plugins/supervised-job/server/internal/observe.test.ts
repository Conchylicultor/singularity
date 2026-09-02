/**
 * The close rule, against real marker files and real processes.
 *
 * Same method as `supervised-run/server/internal/supervisor.test.ts`: the
 * decision is what has to be right, and it is decidable without a database, so
 * it is tested directly rather than through a job dispatch. A live child is a
 * real `sleep`, a dead one is a real reaped process — `isPidAlive` is not
 * something a stub can honestly answer.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import {
  currentWorktreeName,
  worktreeArtifacts,
} from "@plugins/infra/plugins/paths/core";
import { HARD_KILL_EXIT_CODE } from "@plugins/infra/plugins/jobs/plugins/supervised-run/core";
import { observeRun } from "./observe";

const worktree = currentWorktreeName();
/** Lowercase alphanumeric with no separator, per `assertRunKindId`. */
const KIND_ID = "supjobobs";

const created: string[] = [];
const children: Bun.Subprocess[] = [];

function uniqueRunId(tag: string): string {
  return `r-${tag}-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function writeMarker(runId: string, body: string): void {
  mkdirSync(worktreeArtifacts.runsDir(worktree), { recursive: true });
  const path = worktreeArtifacts.runTerminal(worktree, KIND_ID, runId);
  created.push(path);
  writeFileSync(path, body);
}

function spawnLiveChild(): Bun.Subprocess {
  const proc = Bun.spawn(["sleep", "30"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  children.push(proc);
  return proc;
}

afterEach(async () => {
  for (const proc of children.splice(0)) {
    proc.kill("SIGKILL");
    // Awaiting `exited` is what REAPS: `isPidAlive` succeeds on a zombie, so an
    // unreaped child still reads as alive.
    await proc.exited;
  }
  for (const path of created.splice(0)) if (existsSync(path)) rmSync(path);
});

describe("observeRun", () => {
  test("a marker ends the run even while its pid is still alive", async () => {
    const runId = uniqueRunId("marker");
    const proc = spawnLiveChild();
    writeMarker(runId, "0 -\n");

    const observation = observeRun(KIND_ID, runId, proc.pid);

    expect(observation.state).toBe("ended");
    if (observation.state !== "ended") return;
    expect(observation.terminal.exitCode).toBe(0);
    expect(observation.terminal.signalCode).toBeNull();
  });

  test("a killed run reports the signal it OBSERVED, not one derived from 143", () => {
    const runId = uniqueRunId("killed");
    writeMarker(runId, "143 TERM\n");

    const observation = observeRun(KIND_ID, runId, null);

    expect(observation).toEqual({
      state: "ended",
      terminal: expect.objectContaining({ exitCode: 143, signalCode: "TERM" }),
    });
  });

  test("a deliberate exit(143) is NOT reported as a kill", () => {
    const runId = uniqueRunId("exit143");
    writeMarker(runId, "143 -\n");

    const observation = observeRun(KIND_ID, runId, null);

    expect(observation).toEqual({
      state: "ended",
      terminal: expect.objectContaining({ exitCode: 143, signalCode: null }),
    });
  });

  test("no marker and a live pid is the only running shape", () => {
    const runId = uniqueRunId("running");
    const proc = spawnLiveChild();

    expect(observeRun(KIND_ID, runId, proc.pid)).toEqual({ state: "running" });
  });

  test("no marker and a dead pid is a hard kill, with no signal claimed", async () => {
    const runId = uniqueRunId("hardkill");
    const proc = spawnLiveChild();
    proc.kill("SIGKILL");
    await proc.exited;

    const observation = observeRun(KIND_ID, runId, proc.pid);

    expect(observation.state).toBe("ended");
    if (observation.state !== "ended") return;
    expect(observation.terminal.exitCode).toBe(HARD_KILL_EXIT_CODE);
    expect(observation.terminal.signalCode).toBeNull();
  });
});
