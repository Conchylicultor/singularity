// Exercised against REAL throwaway processes, mirroring capture.test.ts: the
// escalation logic (SIGTERM grace → SIGKILL) is exactly what a mock would fake
// away, and the upstream bug this exists for (oven-sh/bun#27766) is a process
// that ignores SIGTERM — so one specimen here does exactly that.

import { afterEach, describe, expect, test } from "bun:test";
import { reapWedge } from "./reap";

const spawned: Array<ReturnType<typeof Bun.spawn>> = [];

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

describe("reapWedge", () => {
  test("a SIGTERM-honoring process exits on the graceful path", async () => {
    const proc = specimen("sleep 60");
    await Bun.sleep(150);

    const res = await reapWedge(proc.pid);

    expect(res.outcome).toBe("exited-sigterm");
    expect(res.failures).toEqual([]);
  }, 30_000);

  test("a SIGTERM-ignoring process is escalated to SIGKILL", async () => {
    // `trap '' TERM` = the upstream-reported wedge behavior: SIGTERM delivered
    // and discarded while the process keeps running.
    const proc = specimen("trap '' TERM; while :; do sleep 0.2; done");
    await Bun.sleep(300); // let the trap install before we signal

    const res = await reapWedge(proc.pid);

    expect(res.outcome).toBe("exited-sigkill");
    expect(res.failures).toEqual([]);
  }, 30_000);

  test("an already-dead pid is reported as such, not signalled blindly", async () => {
    const proc = specimen("exit 0");
    await proc.exited;
    await Bun.sleep(100);

    const res = await reapWedge(proc.pid);

    expect(res.outcome).toBe("already-dead");
    expect(res.failures).toEqual([]);
  }, 30_000);
});
