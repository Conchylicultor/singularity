// Exercised against REAL throwaway processes, not mocks. The whole reason this
// module exists is that a previous investigation trusted a misread `ps` number;
// a test that stubs `ps` would reproduce that mistake rather than catch it. So we
// spawn a genuinely idle process with a genuinely live child, and a genuinely
// busy one, and assert the capture tells them apart.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineFileSink } from "@plugins/infra/plugins/file-sink/core";
import { captureOpWedge, parseCpuTimeMs, parseInspectFlag } from "./capture";

// A throwaway sink, so the suite never appends fake wedges to the REAL host
// forensics log — the next person reading it during an actual incident must not
// find test noise in their evidence. It has to be injected rather than redirected
// by env: `SINGULARITY_DIR` is frozen at module eval by the `bun test` preload,
// which imports `paths/core` before any test file runs.
const testSink = defineFileSink({
  id: "op-wedge-capture-test",
  description: "Throwaway dump sink for the op-wedge capture suite.",
  path: join(mkdtempSync(join(tmpdir(), "op-wedge-capture-test-")), "dump.log"),
});

const spawned: Array<ReturnType<typeof Bun.spawn>> = [];

/** Spawn a specimen and register it for teardown, so no test leaks a process. */
function specimen(script: string): ReturnType<typeof Bun.spawn> {
  const proc = Bun.spawn(["sh", "-c", script], {
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
  });
  spawned.push(proc);
  return proc;
}

afterEach(async () => {
  for (const proc of spawned.splice(0)) {
    proc.kill("SIGKILL");
    await proc.exited;
  }
});

const req = (pid: number) => ({
  pid,
  worktree: "test-worktree-does-not-exist",
  op: "check",
  startedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
});

// Short knobs so the suite runs in seconds. The code path is identical to
// production; only the durations differ.
const fast = { sampleSeconds: 1, cpuIntervalMs: 800, sink: testSink };

describe("captureOpWedge", () => {
  test("finds the live child of an idle process and calls it idle", async () => {
    // `sleep & wait` keeps the shell alive as a PARENT with one live child —
    // structurally the shape of the wedge under investigation (CLI parked, git
    // child still alive), which is exactly the datum `children` must surface.
    const proc = specimen("sleep 30 & wait");
    await Bun.sleep(300); // let the shell fork before we photograph it

    const cap = await captureOpWedge(req(proc.pid), fast);

    expect(cap.alive).toBe(true);
    expect(cap.children.length).toBeGreaterThanOrEqual(1);
    const sleeper = cap.children.find((c) => c.command.includes("sleep"));
    expect(sleeper).toBeDefined();
    expect(sleeper!.ppid).toBe(proc.pid);
    expect(sleeper!.state.length).toBeGreaterThan(0);
    expect(sleeper!.etime.length).toBeGreaterThan(0);

    // The load-bearing assertion: a parked process is "idle", derived from a
    // delta over a measured wall gap — never from a single %CPU reading.
    expect(cap.cpu.wallMs).toBeGreaterThanOrEqual(fast.cpuIntervalMs);
    expect(cap.cpu.verdict).toBe("idle");
    expect(cap.cpu.ratio).toBeLessThan(0.5);

    // Nothing spins, so the specimen falls back to the marker pid itself — the
    // regression guard for "specimen targeting must not change the normal case".
    expect(cap.specimen.pid).toBe(proc.pid);
    // Per-child CPU is carried, not dropped: the lifetime %CPU for context and
    // the sampled delta ratio as the verdict-grade number.
    expect(typeof sleeper!.cpuPct).toBe("string");
    expect(sleeper!.cpuRatio).not.toBeUndefined();

    // The op marker is deliberately absent for this fake worktree, so exactly one
    // failure is expected — and it must be REPORTED, not absorbed.
    expect(cap.failures.map((f) => f.step)).toContain("op-marker");
    const unexpected = cap.failures.filter((f) => f.step !== "op-marker");
    expect(unexpected).toEqual([]);
  }, 60_000);

  test("calls a busy process spinning", async () => {
    const proc = specimen("while :; do :; done");
    await Bun.sleep(200);

    const cap = await captureOpWedge(req(proc.pid), fast);

    expect(cap.alive).toBe(true);
    expect(cap.cpu.verdict).toBe("spinning");
    expect(cap.cpu.ratio).toBeGreaterThan(0.5);
    // The marker pid is its own specimen when it is the one burning.
    expect(cap.specimen.pid).toBe(proc.pid);
    expect(cap.specimen.cpuRatio).toBeGreaterThan(0.5);
    // A busy shell loop forks nothing — the counterpart to the idle case above.
    expect(cap.children).toEqual([]);
  }, 60_000);

  test("an idle marker with a spinning descendant names the DESCENDANT as specimen", async () => {
    // The 2026-07-22 m0gj incident shape: the marker pid (a push worker) parked
    // in `wait` while a marker-less descendant (nested check worker) burns a
    // core. The verdict must be tree-aware and the specimen must be the child —
    // this is what points the JS probe and the reap at the true wedge.
    const proc = specimen("(while :; do :; done) & wait");
    await Bun.sleep(300);

    const cap = await captureOpWedge(req(proc.pid), fast);

    expect(cap.alive).toBe(true);
    expect(cap.cpu.verdict).toBe("spinning");
    expect(cap.specimen.pid).not.toBe(proc.pid);
    expect(cap.specimen.cpuRatio).toBeGreaterThan(0.5);
    // The specimen is one of the captured descendants, and its row carries the
    // same verdict-grade ratio.
    const specimenRow = cap.children.find((c) => c.pid === cap.specimen.pid);
    expect(specimenRow).toBeDefined();
    expect(specimenRow!.cpuRatio).not.toBeNull();
    expect(specimenRow!.cpuRatio!).toBeGreaterThan(0.5);
    expect(cap.specimen.command).toBe(specimenRow!.command);
  }, 60_000);

  test("writes a durable dump naming the verdict and the child tree", async () => {
    const proc = specimen("sleep 30 & wait");
    await Bun.sleep(300);

    const cap = await captureOpWedge(req(proc.pid), fast);
    const dump = readFileSync(cap.dumpPath, "utf8");

    expect(dump).toContain(`pid=${proc.pid}`);
    expect(dump).toContain("[2] process tree");
    expect(dump).toContain("sleep");
    // A partial capture must SAY it is partial — the header is what a human reads
    // first, and "complete" printed over a missing section is the failure mode
    // this whole module is meant to avoid.
    expect(dump).toContain("this capture is PARTIAL");
  }, 60_000);

  test("reports a dead pid loudly instead of returning an empty capture", async () => {
    const proc = specimen("exit 0");
    await proc.exited;
    await Bun.sleep(200);

    const cap = await captureOpWedge(req(proc.pid), fast);

    expect(cap.alive).toBe(false);
    expect(cap.cpu.verdict).toBe("unknown");
    expect(cap.children).toEqual([]);
    const steps = cap.failures.map((f) => f.step);
    expect(steps).toContain("liveness");
    expect(steps).toContain("cpu-sample-1");
    expect(steps).toContain("cpu-sample-2");
  }, 60_000);
});

describe("parseInspectFlag", () => {
  test("extracts a pre-armed inspector URL from full argv", () => {
    expect(
      parseInspectFlag("/usr/bin/bun --inspect=localhost:54791/04a98905 index.ts check --scope tree"),
    ).toBe("localhost:54791/04a98905");
  });

  test("returns null for a bare --inspect (nothing to connect to) or no flag", () => {
    expect(parseInspectFlag("bun --inspect index.ts check")).toBeNull();
    expect(parseInspectFlag("bun index.ts check")).toBeNull();
  });
});

describe("parseCpuTimeMs", () => {
  test("parses every shape ps emits", () => {
    expect(parseCpuTimeMs("0:00.01")).toBe(10);
    expect(parseCpuTimeMs("  1:30.50 ")).toBe(90_500);
    expect(parseCpuTimeMs("2:03:04")).toBe((2 * 3600 + 3 * 60 + 4) * 1000);
    expect(parseCpuTimeMs("1-00:00:00")).toBe(86_400_000);
  });

  test("returns null rather than 0 for unparseable input", () => {
    // Collapsing these onto 0 would make a parse bug read as a confident "idle".
    expect(parseCpuTimeMs("")).toBeNull();
    expect(parseCpuTimeMs("-")).toBeNull();
    expect(parseCpuTimeMs("nonsense")).toBeNull();
  });
});
