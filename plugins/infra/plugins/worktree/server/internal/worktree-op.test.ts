import { test, expect } from "bun:test";
import { closeSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dlopen } from "bun:ffi";
import {
  clearPushHolder,
  derivePushPhases,
  pushLockHeld,
  readPushHolder,
  writePushHolder,
  type PushHolder,
  type WorktreeOpInfo,
} from "./worktree-op";

// --- helpers ---------------------------------------------------------------

function pushMarker(slug: string): WorktreeOpInfo {
  return { slug, op: "push", startedAt: "2026-06-07T00:00:00.000Z", phase: "running", runningAt: null };
}
function buildMarker(slug: string): WorktreeOpInfo {
  return { slug, op: "build", startedAt: "2026-06-07T00:00:00.000Z", phase: "running", runningAt: null };
}
function holder(slug: string, pid = 1234, pushId = "p-1"): PushHolder {
  return { slug, pid, pushId, acquiredAt: "2026-06-07T00:00:00.000Z" };
}
const alive = () => true;
const dead = () => false;
const phaseOf = (out: WorktreeOpInfo[], slug: string) =>
  out.find((m) => m.slug === slug)?.phase;

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
