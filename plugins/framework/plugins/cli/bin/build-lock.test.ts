import { test, expect } from "bun:test";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "node:os";
import { join } from "path";
import { flockTry } from "@plugins/packages/plugins/flock/server";
import { acquireBuildLock } from "./build-lock";

function freshTmpDir(): string {
  return mkdtempSync(join(os.tmpdir(), "build-lock-test-"));
}

/** A pid that is (with overwhelming probability) not a live process. */
async function deadPid(): Promise<number> {
  const proc = Bun.spawn(["true"], { stdout: "ignore", stderr: "ignore" });
  await proc.exited;
  const pid = proc.pid;
  try {
    process.kill(pid, 0);
    throw new Error(`pid ${pid} unexpectedly still alive`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
  }
  return pid;
}

/**
 * A standalone holder process that takes the flock and then parks forever, so
 * the parent can SIGKILL it. Deliberately imports NOTHING from the repo (a raw
 * `bun:ffi` flock inline) so it can live in a temp dir with no alias resolution.
 */
const HOLDER_SCRIPT = `
import { dlopen } from "bun:ffi";
import { openSync } from "fs";
const { symbols } = dlopen(
  process.platform === "darwin" ? "libc.dylib" : "libc.so.6",
  { flock: { args: ["i32", "i32"], returns: "i32" } },
);
const fd = openSync(process.argv[2], "a");
if (symbols.flock(fd, 2 | 4) !== 0) throw new Error("holder could not take the lock");
console.log("held");
await new Promise(() => {});
`;

async function spawnKilledHolder(lockPath: string, dir: string): Promise<void> {
  const script = join(dir, "holder.ts");
  writeFileSync(script, HOLDER_SCRIPT);
  const proc = Bun.spawn(["bun", script, lockPath], { stdout: "pipe", stderr: "inherit" });
  // Wait until it actually holds the lock before killing it.
  const reader = proc.stdout.getReader();
  const { value } = await reader.read();
  expect(new TextDecoder().decode(value)).toContain("held");
  reader.releaseLock();
  proc.kill("SIGKILL");
  await proc.exited;
}

// THE regression this module exists for. A build killed by a caller timeout runs
// no exit handler, so the lock file and its pid line are left behind — and under
// the old symlink+heartbeat scheme the next build could then block until its
// 10–30 min cap (PID reuse making the dead holder look alive). The kernel
// released the flock the instant the holder died, so this must be instant.
test("acquires immediately after a holder was SIGKILLed", async () => {
  const dir = freshTmpDir();
  try {
    const lockPath = join(dir, ".build.lock");
    await spawnKilledHolder(lockPath, dir);
    expect(existsSync(lockPath)).toBe(true); // the file outlives its holder…

    const startedAt = Date.now();
    const release = await acquireBuildLock(lockPath, { pollMs: 10, capMs: 5_000 });
    try {
      expect(Date.now() - startedAt).toBeLessThan(1_000); // …but the lock does not
    } finally {
      release();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A leftover pid line is diagnostics, never an input to the lock decision — so a
// stale one cannot make the lock look held. (Under the old scheme this exact
// state was what a waiter had to reason about with `kill(pid, 0)`.)
test("a stale pid in the file does not block acquisition", async () => {
  const dir = freshTmpDir();
  try {
    const lockPath = join(dir, ".build.lock");
    writeFileSync(lockPath, `${await deadPid()}\n`);

    const release = await acquireBuildLock(lockPath, { pollMs: 10, capMs: 5_000 });
    try {
      expect(readFileSync(lockPath, "utf8").trim()).toBe(String(process.pid));
    } finally {
      release();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("never acquires while another holder is alive", async () => {
  const dir = freshTmpDir();
  try {
    const lockPath = join(dir, ".build.lock");
    // flock is owned by the open file description, so a second descriptor on the
    // same file conflicts even within this process.
    const heldFd = openSync(lockPath, "a");
    expect(flockTry(heldFd)).toBe(true);
    writeFileSync(lockPath, `${process.pid}\n`);

    let message: string | undefined;
    try {
      const release = await acquireBuildLock(lockPath, { pollMs: 10, capMs: 100, staleMs: 10_000 });
      release(); // unreachable — a held lock must never be granted twice
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain("Timed out");
    expect(message).toContain(`held by pid ${process.pid}`);

    closeSync(heldFd);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("uncontended acquire then release, and the lock file is never unlinked", async () => {
  const dir = freshTmpDir();
  try {
    const lockPath = join(dir, ".build.lock");

    const release = await acquireBuildLock(lockPath, { pollMs: 10 });
    expect(existsSync(lockPath)).toBe(true);
    release();
    // Unlinking is what let the old release() delete a SUCCESSOR's lock; the fd
    // is the lock now, so the file stays put.
    expect(existsSync(lockPath)).toBe(true);

    // Re-acquiring proves the release genuinely freed the kernel lock.
    const release2 = await acquireBuildLock(lockPath, { pollMs: 10, capMs: 2_000 });
    release2();
    release2(); // idempotent
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
