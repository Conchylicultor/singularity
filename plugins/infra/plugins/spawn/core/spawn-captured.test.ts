/**
 * Tests for the wedge-proof capture spawn. Run with `bun test`.
 *
 * The FIRST test is the load-bearing gate for the whole plan: it proves that
 * numeric temp-file fds work as `Bun.spawn` stdio targets on this machine's
 * bun (verified on 1.3.13). If that test fails, the fd mechanics regressed —
 * fall back to `Bun.file(path)` targets before touching anything else.
 *
 * The stress test at the end is the wedge smoke test: a burst of fast-exiting
 * noisy children is exactly the shape that wedges piped stdio (child exits
 * during a pending stream pull); with fd redirection it must always complete.
 */

import { test, expect } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnCaptured, spawnExpectOk, SpawnFailedError } from "./internal/spawn-captured";

test("GATE: numeric-fd stdio — echo roundtrip captures stdout", async () => {
  const result = await spawnCaptured(["echo", "hello-fd"]);
  expect(result.exitCode).toBe(0);
  expect(result.signalCode).toBeNull();
  expect(result.stdout).toBe("hello-fd\n");
  expect(result.stderr).toBe("");
});

test("non-zero exit is a result, not an error", async () => {
  const result = await spawnCaptured(["sh", "-c", "echo failing 1>&2; exit 3"]);
  expect(result.exitCode).toBe(3);
  expect(result.stderr).toBe("failing\n");
  expect(result.stdout).toBe("");
});

test("spawnExpectOk throws SpawnFailedError carrying the capture", async () => {
  expect.assertions(4);
  try {
    await spawnExpectOk(["sh", "-c", "echo diagnostics 1>&2; exit 7"]);
  } catch (err) {
    if (!(err instanceof SpawnFailedError)) throw err;
    expect(err.exitCode).toBe(7);
    expect(err.stderr).toBe("diagnostics\n");
    expect(err.argv[0]).toBe("sh");
    expect(err.message).toContain("exit 7");
  }
});

test("binary fidelity: stdoutBytes carries all 256 byte values untouched", async () => {
  const script = "process.stdout.write(Buffer.from(Array.from({ length: 256 }, (_, i) => i)));";
  const result = await spawnCaptured([process.execPath, "-e", script]);
  expect(result.exitCode).toBe(0);
  expect(result.stdoutBytes.length).toBe(256);
  for (let i = 0; i < 256; i++) expect(result.stdoutBytes[i]).toBe(i);
});

test("stdin roundtrip: whole-buffer string in, cat out, EOF terminates", async () => {
  const result = await spawnCaptured(["cat"], { stdin: "line-1\nline-2\n" });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe("line-1\nline-2\n");
});

test("stdin roundtrip: Uint8Array in", async () => {
  const bytes = new Uint8Array([0x61, 0x0a, 0x62]);
  const result = await spawnCaptured(["cat"], { stdin: bytes });
  expect(result.exitCode).toBe(0);
  expect(result.stdoutBytes).toEqual(bytes);
});

test("mergeStderr interleaves 2>&1 into stdout; stderr is empty", async () => {
  const result = await spawnCaptured(["sh", "-c", "echo out; echo err 1>&2"], { mergeStderr: true });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe("out\nerr\n");
  expect(result.stderr).toBe("");
  expect(result.stderrBytes.length).toBe(0);
});

test("cwd is honored", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sg-spawn-cwd-"));
  try {
    const result = await spawnCaptured(["sh", "-c", "pwd"], { cwd: dir });
    expect(result.exitCode).toBe(0);
    expect(realpathSync(result.stdout.trim())).toBe(realpathSync(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("env is a full replacement, same contract as Bun.spawn", async () => {
  const result = await spawnCaptured(["sh", "-c", 'printf %s "$SG_SPAWN_TEST"'], {
    env: { ...process.env, SG_SPAWN_TEST: "visible" },
  });
  expect(result.stdout).toBe("visible");
});

test("resourceUsage reports the child's peak RSS", async () => {
  const result = await spawnCaptured(["echo", "rss"]);
  expect(result.exitCode).toBe(0);
  // Bun reports rusage on darwin/linux; a positive byte count for any real child.
  expect(result.resourceUsage.maxRssBytes).toBeGreaterThan(0);
});

test("no timeoutMs: timedOut is false and nothing is killed", async () => {
  const result = await spawnCaptured(["echo", "unbounded"]);
  expect(result.timedOut).toBe(false);
  expect(result.signalCode).toBeNull();
});

test("timeoutMs kills a hung child and reports timedOut", async () => {
  const started = Date.now();
  const result = await spawnCaptured(["sleep", "30"], { timeoutMs: 250 });
  // The deadline is what returned us — not `sleep` finishing 30s later.
  expect(Date.now() - started).toBeLessThan(10_000);
  expect(result.timedOut).toBe(true);
  expect(result.signalCode).toBe("SIGTERM");
}, 15_000);

test("timeoutMs that does not expire leaves the result untouched", async () => {
  const result = await spawnCaptured(["echo", "in-time"], { timeoutMs: 30_000 });
  expect(result.exitCode).toBe(0);
  expect(result.timedOut).toBe(false);
  expect(result.stdout).toBe("in-time\n");
});

test("output written before the deadline is still captured", async () => {
  const result = await spawnCaptured(["sh", "-c", "echo early; sleep 30"], { timeoutMs: 400 });
  expect(result.timedOut).toBe(true);
  expect(result.stdout).toBe("early\n");
}, 15_000);

test("background: true demotes without breaking the capture", async () => {
  const result = await spawnCaptured(["echo", "demoted"], { background: true });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe("demoted\n");
});

test("wedge smoke: 200 fast-exiting noisy children complete (concurrency 20)", async () => {
  const total = 200;
  const concurrency = 20;
  let next = 0;
  const runOne = async () => {
    const result = await spawnCaptured(["sh", "-c", "echo out; echo err 1>&2"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("out\n");
    expect(result.stderr).toBe("err\n");
  };
  const workers = Array.from({ length: concurrency }, async () => {
    while (next < total) {
      next++;
      await runOne();
    }
  });
  await Promise.all(workers);
}, 60_000);
