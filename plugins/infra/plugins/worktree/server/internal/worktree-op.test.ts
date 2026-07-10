import { test, expect } from "bun:test";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { dlopen } from "bun:ffi";
import { worktreeDataDir } from "@plugins/infra/plugins/paths/server";
import {
  clearPushHolder,
  clearWorktreeOp,
  derivePushPhases,
  listActiveWorktreeOps,
  markWorktreeOpStart,
  pushLockHeld,
  readPushHolder,
  setWorktreeOpPhase,
  writePushHolder,
  type PushHolder,
  type WorktreeOp,
  type WorktreeOpInfo,
} from "./worktree-op";

// --- helpers ---------------------------------------------------------------

function pushMarker(slug: string): WorktreeOpInfo {
  return { slug, op: "push", startedAt: "2026-06-07T00:00:00.000Z", phase: "running", runningAt: null };
}
function buildMarker(slug: string): WorktreeOpInfo {
  return { slug, op: "build", startedAt: "2026-06-07T00:00:00.000Z", phase: "running", runningAt: null };
}
function checkMarker(slug: string): WorktreeOpInfo {
  return { slug, op: "check", startedAt: "2026-06-07T00:00:00.000Z", phase: "running", runningAt: null };
}
function holder(slug: string, pid = 1234, pushId = "p-1"): PushHolder {
  return { slug, pid, pushId, acquiredAt: "2026-06-07T00:00:00.000Z" };
}
const alive = () => true;
const dead = () => false;
const phaseOf = (out: WorktreeOpInfo[], slug: string) =>
  out.find((m) => m.slug === slug)?.phase;

// --- op-marker fs helpers --------------------------------------------------
//
// The marker read/write functions resolve their path from the real
// worktreeDataDir(slug); no path injection. So each test uses a throwaway random
// slug (never a real worktree), writes under the real WORKTREES_DIR, and reaps
// the whole slug dir in a finally.

function markerPath(slug: string, op: WorktreeOp): string {
  return join(worktreeDataDir(slug), "ops", `${op}.json`);
}
function writeRawMarker(slug: string, op: WorktreeOp, data: Record<string, unknown>): void {
  mkdirSync(join(worktreeDataDir(slug), "ops"), { recursive: true });
  writeFileSync(markerPath(slug, op), JSON.stringify(data));
}
function readRawMarker(slug: string, op: WorktreeOp): Record<string, unknown> {
  return JSON.parse(readFileSync(markerPath(slug, op), "utf8")) as Record<string, unknown>;
}
function withTempSlug(fn: (slug: string) => void): void {
  const slug = `op-test-${randomUUID()}`;
  try {
    fn(slug);
  } finally {
    rmSync(worktreeDataDir(slug), { recursive: true, force: true });
  }
}
async function withTempSlugAsync(fn: (slug: string) => Promise<void>): Promise<void> {
  const slug = `op-test-${randomUUID()}`;
  try {
    await fn(slug);
  } finally {
    rmSync(worktreeDataDir(slug), { recursive: true, force: true });
  }
}
// A live pid that is never this process — pid 1 (init/launchd) is always alive
// and isPidAlive treats its EPERM as alive, so a marker naming it is not reaped.
const OTHER_LIVE_PID = 1;

// --- derivePushPhases: the core correctness logic --------------------------

test("exactly one push runs — the slug the holder names; two-running impossible", () => {
  const out = derivePushPhases([pushMarker("A"), pushMarker("B")], holder("A"), {
    isAlive: alive,
    lockHeld: () => true,
  });
  expect(phaseOf(out, "A")).toBe("running");
  expect(phaseOf(out, "B")).toBe("waiting-for-lock");
  expect(out.filter((m) => m.phase === "running")).toHaveLength(1);
  // The running push carries the lock-acquired instant; the waiter does not.
  expect(out.find((m) => m.slug === "A")?.runningAt).toBe("2026-06-07T00:00:00.000Z");
  expect(out.find((m) => m.slug === "B")?.runningAt).toBeNull();
});

test("dead holder pid → nobody running, all waiting", () => {
  const out = derivePushPhases([pushMarker("A"), pushMarker("B")], holder("A"), {
    isAlive: dead,
    lockHeld: () => true, // must be ignored once pid is dead
  });
  expect(phaseOf(out, "A")).toBe("waiting-for-lock");
  expect(phaseOf(out, "B")).toBe("waiting-for-lock");
});

test("PID-reuse ghost: holder pid alive but lock is free → all waiting", () => {
  // This is the case today's code displays as "running" forever.
  const out = derivePushPhases([pushMarker("A"), pushMarker("B")], holder("A"), {
    isAlive: alive,
    lockHeld: () => false, // kernel says lock is free → holder is a ghost
  });
  expect(phaseOf(out, "A")).toBe("waiting-for-lock");
  expect(phaseOf(out, "B")).toBe("waiting-for-lock");
});

test("holder alive AND lock genuinely held → that slug runs", () => {
  const out = derivePushPhases([pushMarker("A")], holder("A"), {
    isAlive: alive,
    lockHeld: () => true,
  });
  expect(phaseOf(out, "A")).toBe("running");
});

test("no holder file → all pushes waiting", () => {
  const out = derivePushPhases([pushMarker("A"), pushMarker("B")], null, {
    isAlive: alive,
    lockHeld: () => true,
  });
  expect(out.every((m) => m.phase === "waiting-for-lock")).toBe(true);
});

test("build markers pass through untouched (no lock contention)", () => {
  const out = derivePushPhases([buildMarker("A"), pushMarker("B")], holder("B"), {
    isAlive: alive,
    lockHeld: () => true,
  });
  expect(phaseOf(out, "A")).toBe("running"); // build unchanged
  expect(phaseOf(out, "B")).toBe("running"); // push is the holder
});

test("check markers pass through untouched (no lock contention)", () => {
  const out = derivePushPhases([checkMarker("A"), pushMarker("B")], holder("B"), {
    isAlive: alive,
    lockHeld: () => true,
  });
  expect(out.find((m) => m.slug === "A")?.op).toBe("check"); // op preserved
  expect(phaseOf(out, "A")).toBe("running"); // check unchanged
  expect(phaseOf(out, "B")).toBe("running"); // push is the holder
});

// --- pushLockHeld: the kernel flock probe (real FFI, throwaway path) --------

test("pushLockHeld reflects real flock state on a temp lock file", () => {
  const dir = mkdtempSync(join(tmpdir(), "op-lock-"));
  const lockPath = join(dir, "push.lock");
  try {
    expect(pushLockHeld(lockPath)).toBe(false); // nobody holds it

    // Hold the flock from this test on a separate fd; a separate-fd probe
    // contends even within one process.
    const { symbols } = dlopen(
      process.platform === "darwin" ? "libc.dylib" : "libc.so.6",
      { flock: { args: ["i32", "i32"], returns: "i32" } },
    );
    const flock = symbols.flock as (fd: number, op: number) => number;
    const fd = openSync(lockPath, "a");
    expect(flock(fd, 2)).toBe(0); // LOCK_EX
    expect(pushLockHeld(lockPath)).toBe(true); // now held

    closeSync(fd); // release
    expect(pushLockHeld(lockPath)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- holder file fs adapters (temp path) -----------------------------------

test("holder write/read round-trips and clear is pushId-guarded", () => {
  const dir = mkdtempSync(join(tmpdir(), "op-holder-"));
  const path = join(dir, "push-holder.json");
  try {
    writePushHolder(holder("A", 42, "px"), path);
    expect(readPushHolder(path)).toEqual(holder("A", 42, "px"));

    // A different push must NOT delete the current holder's file.
    clearPushHolder("py", path);
    expect(readPushHolder(path)).not.toBeNull();

    // The owning push clears it.
    clearPushHolder("px", path);
    expect(readPushHolder(path)).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- clearWorktreeOp: ownership-guarded reap -------------------------------

test("clearWorktreeOp removes a marker owned by this process", () => {
  withTempSlug((slug) => {
    markWorktreeOpStart(slug, "build"); // stamps process.pid
    expect(existsSync(markerPath(slug, "build"))).toBe(true);
    clearWorktreeOp(slug, "build");
    expect(existsSync(markerPath(slug, "build"))).toBe(false);
  });
});

test("clearWorktreeOp leaves a marker a newer op (another live pid) now owns", () => {
  withTempSlug((slug) => {
    // A queued build overwrote the single build.json with its own pid; the
    // earlier build must not delete it on exit.
    writeRawMarker(slug, "build", {
      op: "build",
      pid: OTHER_LIVE_PID,
      startedAt: "2026-06-07T00:00:00.000Z",
      phase: "running",
    });
    clearWorktreeOp(slug, "build");
    expect(existsSync(markerPath(slug, "build"))).toBe(true);
  });
});

test("clearWorktreeOp still reaps a garbage/unparseable marker", () => {
  withTempSlug((slug) => {
    mkdirSync(join(worktreeDataDir(slug), "ops"), { recursive: true });
    writeFileSync(markerPath(slug, "build"), "{ not json");
    clearWorktreeOp(slug, "build");
    expect(existsSync(markerPath(slug, "build"))).toBe(false);
  });
});

// --- setWorktreeOpPhase: ownership guard + runningAt stamp -----------------

test("setWorktreeOpPhase is a no-op when the marker names another pid", () => {
  withTempSlug((slug) => {
    writeRawMarker(slug, "build", {
      op: "build",
      pid: OTHER_LIVE_PID,
      startedAt: "2026-06-07T00:00:00.000Z",
      phase: "waiting-for-lock",
    });
    setWorktreeOpPhase(slug, "build", "running");
    const raw = readRawMarker(slug, "build");
    expect(raw.phase).toBe("waiting-for-lock"); // untouched
    expect(raw.runningAt).toBeUndefined();
  });
});

test("setWorktreeOpPhase stamps runningAt once and preserves pid/startedAt on re-flip", () => {
  withTempSlug((slug) => {
    markWorktreeOpStart(slug, "build", "waiting-for-lock");
    const started = readRawMarker(slug, "build").startedAt;

    setWorktreeOpPhase(slug, "build", "running");
    const first = readRawMarker(slug, "build");
    expect(first.phase).toBe("running");
    expect(first.pid).toBe(process.pid);
    expect(first.startedAt).toBe(started);
    expect(typeof first.runningAt).toBe("string");

    // A second flip must not reset the work clock (first transition wins).
    setWorktreeOpPhase(slug, "build", "running");
    const second = readRawMarker(slug, "build");
    expect(second.runningAt).toBe(first.runningAt);
    expect(second.startedAt).toBe(started);
    expect(second.pid).toBe(process.pid);
  });
});

// --- marker read path: a stored runningAt surfaces in the parsed info ------

test("listActiveWorktreeOps surfaces a build's stored runningAt", async () => {
  await withTempSlugAsync(async (slug) => {
    writeRawMarker(slug, "build", {
      op: "build",
      pid: process.pid,
      startedAt: "2026-06-07T00:00:00.000Z",
      phase: "running",
      runningAt: "2026-06-07T00:00:05.000Z",
    });
    const mine = (await listActiveWorktreeOps()).find((m) => m.slug === slug);
    expect(mine).toBeDefined();
    expect(mine?.op).toBe("build");
    expect(mine?.runningAt).toBe("2026-06-07T00:00:05.000Z");
  });
});

test("derivePushPhases overrides a push marker's stored runningAt from the holder", () => {
  // A push marker may carry a stale/self-asserted runningAt; the holder file is
  // the authority, so a running push takes the holder's acquiredAt.
  const stale: WorktreeOpInfo = {
    slug: "A",
    op: "push",
    startedAt: "2026-06-07T00:00:00.000Z",
    phase: "running",
    runningAt: "1999-01-01T00:00:00.000Z",
  };
  const out = derivePushPhases([stale], holder("A"), { isAlive: alive, lockHeld: () => true });
  expect(out.find((m) => m.slug === "A")?.runningAt).toBe("2026-06-07T00:00:00.000Z");
});
