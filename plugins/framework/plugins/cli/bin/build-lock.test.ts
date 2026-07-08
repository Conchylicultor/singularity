import { test, expect } from "bun:test";
import {
  lstatSync,
  lutimesSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "fs";
import os from "node:os";
import { join } from "path";
import { acquireBuildLock } from "./build-lock";

function freshTmpDir(): string {
  return mkdtempSync(join(os.tmpdir(), "build-lock-test-"));
}

// The lock is a symlink to a `pid-...` target that never exists as a real file,
// so `existsSync` (which follows links) would report a dangling lock as absent.
// Check the link itself.
function lockPresent(p: string): boolean {
  return !!lstatSync(p, { throwIfNoEntry: false });
}

/** A pid that is (with overwhelming probability) not a live process. */
async function deadPid(): Promise<number> {
  const proc = Bun.spawn(["true"], { stdout: "ignore", stderr: "ignore" });
  await proc.exited;
  const pid = proc.pid;
  // Confirm it is actually dead before relying on it.
  try {
    process.kill(pid, 0);
    throw new Error(`pid ${pid} unexpectedly still alive`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
  }
  return pid;
}

test("steals a lock held by a dead process", async () => {
  const dir = freshTmpDir();
  try {
    const lockPath = join(dir, ".build.lock");
    const dead = await deadPid();
    symlinkSync(`pid-${dead}-${Date.now()}`, lockPath);

    const release = await acquireBuildLock(lockPath, { pollMs: 10 });
    try {
      // The lock now names the current process, not the dead one.
      expect(readlinkSync(lockPath)).toContain(`pid-${process.pid}-`);
    } finally {
      release();
    }
    expect(lockPresent(lockPath)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("throws (does not steal) against a live, wedged holder", async () => {
  const dir = freshTmpDir();
  try {
    const lockPath = join(dir, ".build.lock");
    // Held by us (alive), with a stale stamp in BOTH freshness encodings so the
    // test is agnostic to whether the module uses mtime or target-ts.
    const staleTs = Date.now() - 60_000;
    symlinkSync(`pid-${process.pid}-${staleTs}`, lockPath);
    const past = new Date(staleTs);
    lutimesSync(lockPath, past, past);

    let message: string | undefined;
    try {
      const release = await acquireBuildLock(lockPath, {
        staleMs: 50,
        pollMs: 10,
        heartbeatMs: 10_000,
      });
      release(); // unreachable — a live wedged holder must never be stolen from
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toMatch(new RegExp(`pid ${process.pid}`));

    // The live holder's lock is left intact — never stolen.
    expect(lockPresent(lockPath)).toBe(true);
    expect(readlinkSync(lockPath)).toBe(`pid-${process.pid}-${staleTs}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("uncontended acquire then release", async () => {
  const dir = freshTmpDir();
  try {
    const lockPath = join(dir, ".build.lock");

    const release = await acquireBuildLock(lockPath, { pollMs: 10 });
    expect(lockPresent(lockPath)).toBe(true);
    release();
    expect(lockPresent(lockPath)).toBe(false);

    // Re-acquiring after release works, proving the heartbeat interval was
    // cleared and the lock is genuinely free again.
    const release2 = await acquireBuildLock(lockPath, { pollMs: 10 });
    expect(lockPresent(lockPath)).toBe(true);
    release2();
    expect(lockPresent(lockPath)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
