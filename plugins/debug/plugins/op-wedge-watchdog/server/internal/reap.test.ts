// Exercised against REAL throwaway processes, mirroring capture.test.ts: the
// escalation logic (SIGTERM grace → SIGKILL) is exactly what a mock would fake
// away, and the upstream bug this exists for (oven-sh/bun#27766) is a process
// that ignores SIGTERM — so one specimen here does exactly that.

import { afterEach, describe, expect, test } from "bun:test";
import { reapTree, reapWedge } from "./reap";
import { runBounded, type WedgeChild } from "./capture";
import { PS } from "@plugins/infra/plugins/paths/server";

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

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Photograph one live child of `parentPid` as the capture would: real ppid and
 * real full command from ps, so reapTree's identity re-verification passes. */
async function photographChild(parentPid: number, commandNeedle: string): Promise<WedgeChild> {
  const res = await runBounded([PS, "-axo", "pid=,ppid=,command="], 10_000);
  if (!res.ok) throw new Error(`ps failed: ${res.error}`);
  for (const line of res.stdout.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    if (Number(m[2]) === parentPid && m[3]!.includes(commandNeedle)) {
      return {
        pid: Number(m[1]),
        ppid: Number(m[2]),
        state: "S",
        etime: "0:01",
        command: m[3]!,
        cpuPct: "0.0",
        cpuRatio: null,
      };
    }
  }
  throw new Error(`no child of ${parentPid} matching ${JSON.stringify(commandNeedle)}`);
}

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

describe("reapTree", () => {
  test("reaps the whole tree — descendant first, marker last", async () => {
    const proc = specimen("sleep 60 & wait");
    await Bun.sleep(300);
    const child = await photographChild(proc.pid, "sleep 60");

    const res = await reapTree({ pid: proc.pid }, [child]);

    expect(res.rollup).toBe("all-reaped");
    expect(res.failures).toEqual([]);
    expect(res.outcomes.map((o) => o.role)).toEqual(["descendant", "marker"]);
    for (const o of res.outcomes) {
      expect(["exited-sigterm", "exited-sigkill", "already-dead"]).toContain(o.outcome);
    }
    expect(isPidAlive(child.pid)).toBe(false);
    expect(isPidAlive(proc.pid)).toBe(false);
  }, 30_000);

  test("a descendant whose identity no longer matches is NOT signalled", async () => {
    // Pid reuse between capture and reap: same pid, different process. The
    // captured command won't match the live one, so the pid must be skipped —
    // killing on stale identity would kill an innocent process.
    const proc = specimen("sleep 60 & wait");
    await Bun.sleep(300);
    const child = await photographChild(proc.pid, "sleep 60");
    const impostor: WedgeChild = { ...child, command: "definitely-not-this-process" };

    const res = await reapTree({ pid: proc.pid }, [impostor]);

    const desc = res.outcomes.find((o) => o.role === "descendant");
    expect(desc?.outcome).toBe("identity-mismatch");
    expect(res.rollup).toBe("some-survived");
    // The mismatched pid was never signalled: the sleeper is still alive
    // (orphaned by the marker's death, but alive).
    expect(isPidAlive(child.pid)).toBe(true);
    // The marker itself was still reaped — the fleet must unblock regardless.
    expect(isPidAlive(proc.pid)).toBe(false);
    process.kill(child.pid, "SIGKILL");
  }, 30_000);

  test("a descendant that died since the capture is reported vanished, not signalled", async () => {
    const marker = specimen("sleep 60");
    const gone = specimen("exit 0");
    await gone.exited;
    await Bun.sleep(100);
    const ghost: WedgeChild = {
      pid: gone.pid,
      ppid: marker.pid,
      state: "S",
      etime: "0:01",
      command: "sh -c exit 0",
      cpuPct: "0.0",
      cpuRatio: null,
    };

    const res = await reapTree({ pid: marker.pid }, [ghost]);

    const desc = res.outcomes.find((o) => o.role === "descendant");
    expect(desc?.outcome).toBe("vanished");
    expect(res.rollup).toBe("all-reaped");
    expect(isPidAlive(marker.pid)).toBe(false);
  }, 30_000);
});
