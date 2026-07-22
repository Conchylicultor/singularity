// End-to-end against a REAL armed bun process: spawns a dummy under
// `--inspect` running a busy-but-yielding JS loop (the control shape validated
// against the 2026-07-22 wedge capture) and asserts the interrogation pipeline
// — spawn js-interrogate.ts → inspector ws → JSC sampling profiler → summary —
// names its hot function. A mocked inspector would test nothing: the whole
// point of this module is that the real protocol works against a real target.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineFileSink } from "@plugins/infra/plugins/file-sink/core";
import { probeWedgeJs } from "./probe";

const testSink = defineFileSink({
  id: "op-wedge-probe-test",
  description: "Throwaway dump sink for the op-wedge JS-probe suite.",
  path: join(mkdtempSync(join(tmpdir(), "op-wedge-probe-test-")), "dump.log"),
});

const spawned: Array<ReturnType<typeof Bun.spawn>> = [];

afterEach(async () => {
  for (const proc of spawned.splice(0)) {
    proc.kill("SIGKILL");
    await proc.exited;
  }
});

// Busy-but-yielding hot loop: burns CPU in JS yet returns to the event loop
// every ~150ms, so the inspector (which dispatches on the JS thread) answers.
const CONTROL_LOOP =
  "let x = 0;" +
  "function spin() { const end = Date.now() + 150;" +
  " while (Date.now() < end) { x += Math.sqrt(x + 1); }" +
  " setTimeout(spin, 0); }" +
  "spin();";

function armedDummy(): { pid: number; inspect: string } {
  const port = 21000 + Math.floor(Math.random() * 20000);
  const inspect = `localhost:${port}/probe-test`;
  const proc = Bun.spawn([process.execPath, `--inspect=${inspect}`, "-e", CONTROL_LOOP], {
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
  });
  spawned.push(proc);
  return { pid: proc.pid, inspect };
}

const req = (pid: number, inspect: string | null) => ({
  pid,
  worktree: "probe-test-worktree",
  op: "check",
  inspect,
  probeSeconds: 3,
  sink: testSink,
});

describe("probeWedgeJs", () => {
  test("names the hot function of a live armed target and dumps the raw evidence", async () => {
    const { pid, inspect } = armedDummy();
    await Bun.sleep(800); // let the inspector server come up

    const summary = await probeWedgeJs(req(pid, inspect));

    expect(summary.armed).toBe(true);
    expect(summary.failures).toEqual([]);
    expect(summary.traceCount).toBeGreaterThan(0);
    expect(summary.topStacks.length).toBeGreaterThan(0);
    // The control's hot function must be named — this is the deliverable.
    const stacks = summary.topStacks.map((s) => s.stack).join("\n");
    expect(stacks).toContain("spin");
    expect(summary.heapDelta).not.toBeNull();

    const dump = readFileSync(testSink.path, "utf8");
    expect(dump).toContain("OP WEDGE JS INTERROGATION");
    expect(dump).toContain(`pid=${pid}`);
    expect(dump).toContain("[J2] lsof");
  }, 60_000);

  test("an unreachable inspector yields loud failures, not an empty success", async () => {
    const { pid } = armedDummy(); // live pid, but we point at a dead ws port

    const summary = await probeWedgeJs(req(pid, "localhost:1/nope"));

    expect(summary.armed).toBe(true);
    expect(summary.traceCount).toBeNull();
    expect(summary.failures.length).toBeGreaterThan(0);
    expect(summary.failures.map((f) => f.step)).toContain("connect");
  }, 60_000);

  test("an unarmed marker is an explicit non-probe, never an empty probe", async () => {
    const summary = await probeWedgeJs(req(process.pid, null));

    expect(summary.armed).toBe(false);
    expect(summary.wsUrl).toBeNull();
    expect(summary.failures.map((f) => f.step)).toEqual(["armed"]);
  }, 15_000);
});
