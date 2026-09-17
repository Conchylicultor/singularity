import { spyOn, test, expect } from "bun:test";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import os from "node:os";
import { join } from "path";
import { flockTry } from "@plugins/packages/plugins/flock/server";
import { acquireCheckoutLock } from "./checkout-lock";

function freshTmpDir(): string {
  return mkdtempSync(join(os.tmpdir(), "checkout-lock-test-"));
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
  const proc = Bun.spawn(["bun", script, lockPath], {
    stdout: "pipe",
    stderr: "inherit",
  });
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
    const release = await acquireCheckoutLock(lockPath, {
      what: "build",
      pollMs: 10,
      capMs: 5_000,
    });
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

    const release = await acquireCheckoutLock(lockPath, {
      what: "build",
      pollMs: 10,
      capMs: 5_000,
    });
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
      const release = await acquireCheckoutLock(lockPath, {
        what: "build",
        pollMs: 10,
        capMs: 100,
        staleMs: 10_000,
      });
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

// One function guards both of a checkout's locks, so every line a waiter prints
// must say WHICH. It used to say "Another build is in progress" for the install
// lock too: a command queued behind another's `bun install` announced a build
// that did not exist, right before crashing on a package the install had added.
test("every wait line names what the lock guards, never a hardcoded build", async () => {
  const dir = freshTmpDir();
  const logSpy = spyOn(console, "log").mockImplementation(() => {});
  try {
    const lockPath = join(dir, ".install.lock");
    const heldFd = openSync(lockPath, "a");
    expect(flockTry(heldFd)).toBe(true);
    writeFileSync(lockPath, `${process.pid}\n`);

    let message: string | undefined;
    try {
      const release = await acquireCheckoutLock(lockPath, {
        what: "dependency install",
        pollMs: 10,
        capMs: 150,
        staleMs: 20, // so the "still waiting" line fires inside the cap
      });
      release(); // unreachable
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    closeSync(heldFd);

    const lines = logSpy.mock.calls.map((args) => String(args[0]));
    expect(lines[0]).toBe(
      `Waiting for the dependency install another command is running in this ` +
        `checkout (held by pid ${process.pid})...`,
    );
    expect(
      lines.some((l) => l.includes("for the dependency install lock")),
    ).toBe(true);
    expect(message).toContain("waiting for the dependency install lock");
    expect([...lines, message].join("\n")).not.toContain("build");
  } finally {
    logSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("uncontended acquire then release, and the lock file is never unlinked", async () => {
  const dir = freshTmpDir();
  try {
    const lockPath = join(dir, ".build.lock");

    const release = await acquireCheckoutLock(lockPath, {
      what: "build",
      pollMs: 10,
    });
    expect(existsSync(lockPath)).toBe(true);
    release();
    // Unlinking is what let the old release() delete a SUCCESSOR's lock; the fd
    // is the lock now, so the file stays put.
    expect(existsSync(lockPath)).toBe(true);

    // Re-acquiring proves the release genuinely freed the kernel lock.
    const release2 = await acquireCheckoutLock(lockPath, {
      what: "build",
      pollMs: 10,
      capMs: 2_000,
    });
    release2();
    release2(); // idempotent
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Holder-aware patience ────────────────────────────────────────────────────
// A deploy's release died after 983 s behind a main build that was healthy the
// whole time — 882 s of it queued for a host CPU grant. The cap measured the
// WAIT, not whether the holder was stuck. These pin the policy that replaced it.

/** Hold `lockPath` from this process on a second fd, stamping our pid. */
function holdInProcess(lockPath: string): () => void {
  const heldFd = openSync(lockPath, "a");
  expect(flockTry(heldFd)).toBe(true);
  writeFileSync(lockPath, `${process.pid}\n`);
  return () => closeSync(heldFd);
}

async function outcome(p: Promise<() => void>): Promise<string> {
  try {
    (await p)();
    return "acquired";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

test("a holder queued in a declared wait never times the waiter out", async () => {
  const dir = freshTmpDir();
  const logSpy = spyOn(console, "log").mockImplementation(() => {});
  try {
    const lockPath = join(dir, ".build.lock");
    const release = holdInProcess(lockPath);
    setTimeout(release, 300); // held for 6× the cap and 6× the stall limit

    const result = await outcome(
      acquireCheckoutLock(lockPath, {
        what: "build",
        pollMs: 10,
        observeEveryMs: 10,
        capMs: 50,
        stallMs: 50,
        observeHolder: () => ({
          kind: "waiting",
          wait: "host-grant",
          since: Date.now(),
          evidence: "op-log.jsonl",
        }),
      }),
    );
    expect(result).toBe("acquired");
  } finally {
    logSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a working holder that keeps advancing outlasts the cap", async () => {
  const dir = freshTmpDir();
  const logSpy = spyOn(console, "log").mockImplementation(() => {});
  try {
    const lockPath = join(dir, ".build.lock");
    const release = holdInProcess(lockPath);
    setTimeout(release, 300);

    const result = await outcome(
      acquireCheckoutLock(lockPath, {
        what: "build",
        pollMs: 10,
        observeEveryMs: 10,
        capMs: 50,
        stallMs: 100,
        observeHolder: () => ({
          kind: "working",
          step: "checks",
          lastAdvanceAt: Date.now(),
          evidence: "build-progress.jsonl",
        }),
      }),
    );
    expect(result).toBe("acquired");
  } finally {
    logSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a working holder that stops advancing times out after the stall limit, naming its step", async () => {
  const dir = freshTmpDir();
  const logSpy = spyOn(console, "log").mockImplementation(() => {});
  try {
    const lockPath = join(dir, ".build.lock");
    const release = holdInProcess(lockPath);
    const frozen = Date.now();

    const startedAt = Date.now();
    const result = await outcome(
      acquireCheckoutLock(lockPath, {
        what: "build",
        pollMs: 10,
        observeEveryMs: 10,
        capMs: 10_000,
        stallMs: 100,
        observeHolder: () => ({
          kind: "working",
          step: "web artifacts",
          lastAdvanceAt: frozen,
          evidence: "build-progress.jsonl",
        }),
      }),
    );
    release();
    expect(result).toContain("Timed out waiting for the build lock");
    expect(result).toContain('still in "web artifacts"');
    expect(Date.now() - startedAt).toBeLessThan(5_000); // the stall limit, not the cap
  } finally {
    logSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("leaving a declared wait starts the stall clock from that moment, not from the last step", async () => {
  const dir = freshTmpDir();
  const logSpy = spyOn(console, "log").mockImplementation(() => {});
  try {
    const lockPath = join(dir, ".build.lock");
    const release = holdInProcess(lockPath);
    const longAgo = Date.now() - 60_000;
    const waitUntil = Date.now() + 150;
    setTimeout(release, 250); // 100 ms of "working" after the wait < 200 ms stall

    const result = await outcome(
      acquireCheckoutLock(lockPath, {
        what: "build",
        pollMs: 10,
        observeEveryMs: 10,
        capMs: 50,
        stallMs: 200,
        observeHolder: () =>
          Date.now() < waitUntil
            ? {
                kind: "waiting",
                wait: "host-grant",
                since: longAgo,
                evidence: "op-log.jsonl",
              }
            : {
                kind: "working",
                step: "checks",
                // The step boundary is a minute old: the queue was the reason.
                lastAdvanceAt: longAgo,
                evidence: "build-progress.jsonl",
              },
      }),
    );
    expect(result).toBe("acquired");
    const lines = logSpy.mock.calls.map((args) => String(args[0]));
    expect(lines.some((l) => l.includes('queued in "host-grant"'))).toBe(true);
    expect(lines.some((l) => l.includes('is in "checks"'))).toBe(true);
  } finally {
    logSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unknown holder keeps the plain cap even with an observer", async () => {
  const dir = freshTmpDir();
  const logSpy = spyOn(console, "log").mockImplementation(() => {});
  try {
    const lockPath = join(dir, ".build.lock");
    const release = holdInProcess(lockPath);
    const result = await outcome(
      acquireCheckoutLock(lockPath, {
        what: "build",
        pollMs: 10,
        observeEveryMs: 10,
        capMs: 80,
        stallMs: 10_000,
        observeHolder: () => ({ kind: "unknown" }),
      }),
    );
    release();
    expect(result).toContain("Timed out");
    expect(result).toContain("cannot see what the holder is doing");
  } finally {
    logSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a new holder gets a fresh budget", async () => {
  const dir = freshTmpDir();
  const logSpy = spyOn(console, "log").mockImplementation(() => {});
  try {
    const lockPath = join(dir, ".build.lock");
    const release = holdInProcess(lockPath);
    const other = await deadPid();
    // At 100 ms the lock "changes hands": the pid line now names another holder.
    // With the cap at 150 ms per holder, a total-wait cap would fire at 150 ms;
    // a per-holder one lasts until 250 ms — after the release at 200 ms.
    setTimeout(() => writeFileSync(lockPath, `${other}\n`), 100);
    setTimeout(release, 200);

    const result = await outcome(
      acquireCheckoutLock(lockPath, {
        what: "build",
        pollMs: 10,
        observeEveryMs: 10,
        capMs: 150,
        observeHolder: () => ({ kind: "unknown" }),
      }),
    );
    expect(result).toBe("acquired");
  } finally {
    logSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  }
});
