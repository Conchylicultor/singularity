/**
 * Unit coverage for the terminal decision every supervised run is closed by.
 *
 * `reconcileSupervisedRuns` binds a registry of kinds whose `finish` writes
 * through the module-level `db` singleton, so — exactly like the
 * `run-build.test.ts` suite this mirrors, and the page/editor `parent-liveness`
 * one before it — it cannot be pointed at a fixture DB. But its per-row close
 * DECISION is fully determined by two pure, db-free functions:
 *
 *   close?  =  !(readRunTerminal(kind, id) == null && isPidAlive(pid))
 *   value   =  readRunTerminal(kind, id) ?? { exitCode: -1, finishedAt: now }
 *
 * So covering `readRunTerminal` (against real marker files at the real resolved
 * path) and `isPidAlive` (against real processes) exercises the whole rule,
 * and the composition block at the bottom restates it verbatim so the three
 * scenarios are asserted end-to-end without a fixture DB:
 *
 *   - marker present, pid alive ⇒ terminal != null ⇒ CLOSE at the recorded code
 *     and the marker's mtime.
 *   - no marker, pid dead ⇒ hard SIGKILL ⇒ CLOSE with {-1, now}.
 *   - no marker, pid alive ⇒ still running ⇒ LEAVE OPEN.
 *
 * Run: `./singularity test plugins/infra/plugins/jobs/plugins/supervised-run`
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import {
  currentWorktreeName,
  worktreeArtifacts,
} from "@plugins/infra/plugins/paths/core";
import { isPidAlive, readRunTerminal, RunMarkerError } from "./terminal";

const KIND = "testkind";
const name = currentWorktreeName();
const created: string[] = [];

function markerPath(runId: string): string {
  return worktreeArtifacts.runTerminal(name, KIND, runId);
}

function writeMarker(runId: string, body: string, mtime?: Date): string {
  mkdirSync(worktreeArtifacts.runsDir(name), { recursive: true });
  const path = markerPath(runId);
  writeFileSync(path, body);
  if (mtime) utimesSync(path, mtime, mtime);
  created.push(path);
  return path;
}

function uniqueRunId(tag: string): string {
  return `test-${tag}-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

afterEach(() => {
  for (const path of created.splice(0)) {
    if (existsSync(path)) rmSync(path);
  }
});

describe("readRunTerminal", () => {
  test("a marker holding 0 reads as a clean exit", () => {
    const runId = uniqueRunId("ok");
    writeMarker(runId, "0 -\n");
    expect(readRunTerminal(KIND, runId)?.exitCode).toBe(0);
  });

  test("a marker holding a non-zero code reads as that code", () => {
    const runId = uniqueRunId("fail");
    writeMarker(runId, "7 -\n");
    expect(readRunTerminal(KIND, runId)?.exitCode).toBe(7);
  });

  test("143 (SIGTERM) is an ordinary recorded code, not a missing marker", () => {
    // The 2026-08-28 incident's shape: the gateway signalled the whole process
    // group mid-deploy. Under the shim that is a RECORDED 143, which is what
    // lets a killed run be told apart from a failed one — before this, a group
    // signal killed the supervisor and left nothing to read.
    const runId = uniqueRunId("killed");
    writeMarker(runId, "143 TERM\n");
    const t = readRunTerminal(KIND, runId);
    expect(t?.exitCode).toBe(143);
    expect(t?.signalCode).toBe("TERM");
  });

  test("the finish instant is the marker's mtime, not the read instant", () => {
    // The property the whole file format exists for. Reusing `new Date()` at
    // reconcile time would inflate the row's Duration by the entire gap between
    // the child exiting and something noticing — often minutes after a restart.
    const runId = uniqueRunId("mtime");
    const finishedAt = new Date(Date.now() - 5 * 60_000);
    writeMarker(runId, "0 -\n", finishedAt);
    const terminal = readRunTerminal(KIND, runId);
    expect(terminal).not.toBeNull();
    // Filesystem mtime granularity varies; a second of slack is well inside it
    // while still being three orders of magnitude tighter than "now".
    expect(
      Math.abs((terminal?.finishedAt.getTime() ?? 0) - finishedAt.getTime()),
    ).toBeLessThan(1_000);
  });

  test("no marker (ENOENT) ⇒ null — the hard-SIGKILL signal", () => {
    expect(readRunTerminal(KIND, uniqueRunId("absent"))).toBeNull();
  });

  test("an unparseable marker THROWS — it is a writer defect, not a run state", () => {
    // Deliberately not `null`. The marker is published by rename and never
    // rewritten, so a reader cannot catch a partial write; malformed bytes mean
    // the shim wrote something it never should, and answering `null` would file
    // that under "hard-killed" and hide the defect behind a plausible `-1`.
    const runId = uniqueRunId("garbage");
    writeMarker(runId, "not a marker");
    expect(() => readRunTerminal(KIND, runId)).toThrow(RunMarkerError);
  });

  test("a one-field marker throws — the signal field is not optional", () => {
    const runId = uniqueRunId("onefield");
    writeMarker(runId, "143");
    expect(() => readRunTerminal(KIND, runId)).toThrow(/malformed exit marker/);
  });

  test("an empty marker throws", () => {
    const runId = uniqueRunId("empty");
    writeMarker(runId, "");
    expect(() => readRunTerminal(KIND, runId)).toThrow(RunMarkerError);
  });

  test("trailing whitespace is tolerated — the code is still read", () => {
    const runId = uniqueRunId("ws");
    writeMarker(runId, "12 -\n");
    expect(readRunTerminal(KIND, runId)?.exitCode).toBe(12);
  });

  test("a number followed by junk throws, never yields the leading number", () => {
    // `parseInt("13oops")` is 13 — a confident wrong answer stamped on the row.
    const runId = uniqueRunId("junk");
    writeMarker(runId, "13oops -");
    expect(() => readRunTerminal(KIND, runId)).toThrow(RunMarkerError);
  });

  test("`-` in the signal field means no signal was observed", () => {
    const runId = uniqueRunId("nosig");
    writeMarker(runId, "143 -\n");
    const terminal = readRunTerminal(KIND, runId);
    // The same 143 a SIGTERM produces, and the field is what separates them.
    expect(terminal?.exitCode).toBe(143);
    expect(terminal?.signalCode).toBeNull();
  });

  test("an invalid kind id throws rather than resolving a path", () => {
    // The `-` ban is what keeps one kind's prune out of another kind's files,
    // so it fails here rather than silently naming a colliding artifact.
    expect(() => readRunTerminal("test-kind", "abc")).toThrow(
      /invalid kind id/,
    );
  });

  test("a run id that would escape the runs dir throws", () => {
    expect(() => readRunTerminal(KIND, "../../etc/passwd")).toThrow(
      /invalid run id/,
    );
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

describe("close condition (composition)", () => {
  // Mirrors the exact per-row rule in `settleRun`, driven by the real
  // readRunTerminal / isPidAlive outputs.
  const now = new Date();
  function decide(
    runId: string,
    pid: number | null,
  ):
    | { exitCode: number; signalCode: string | null; finishedAt: Date }
    | "leave-open" {
    const terminal = readRunTerminal(KIND, runId);
    if (terminal === null && isPidAlive(pid)) return "leave-open";
    return terminal ?? { exitCode: -1, signalCode: null, finishedAt: now };
  }

  test("marker present but pid still alive ⇒ closes from the marker", () => {
    // The shim writes the marker BEFORE it exits, so this shape is the normal
    // one for the few milliseconds before the pid reaps — not an anomaly.
    const runId = uniqueRunId("closealive");
    writeMarker(runId, "0 -\n");
    expect(decide(runId, process.pid)).toMatchObject({ exitCode: 0 });
  });

  test("no marker + pid dead ⇒ closes with the -1/now sentinel", () => {
    expect(decide(uniqueRunId("closedead"), null)).toEqual({
      exitCode: -1,
      signalCode: null,
      finishedAt: now,
    });
  });

  test("running run (no marker, pid alive) ⇒ left open", () => {
    expect(decide(uniqueRunId("running"), process.pid)).toBe("leave-open");
  });
});
