import { describe, expect, test } from "bun:test";
import { duressGuard } from "./duress-guard";
import type { SentinelStatus, SentinelWatch } from "./status";

function recorded(status: SentinelStatus, ownerAlive = true): SentinelWatch {
  return { kind: "recorded", status, pid: 42, ownerAlive };
}

describe("duressGuard", () => {
  test("on only while a live watcher is running", () => {
    expect(duressGuard(recorded({ state: "running", since: 1 }))).toEqual({
      kind: "on",
    });
  });

  test("a running status written by a dead process is off", () => {
    expect(
      duressGuard(recorded({ state: "running", since: 1 }, false)),
    ).toEqual({ kind: "off", why: "main is not running its machine watcher" });
  });

  test("every non-running state is off, with a reason", () => {
    const off: SentinelWatch[] = [
      { kind: "none" },
      { kind: "unreadable", reason: "not JSON" },
      recorded({ state: "disabled", since: 1 }),
      recorded({ state: "starting", since: 1 }),
      recorded({ state: "respawning", since: 1, deaths: 2, lastError: null }),
      recorded({ state: "down", since: 1, deaths: 5, lastError: "boom" }),
      recorded({ state: "stopped", since: 1 }),
    ];
    for (const watch of off) {
      const guard = duressGuard(watch);
      expect(guard.kind).toBe("off");
      expect(guard.kind === "off" && guard.why.length > 0).toBe(true);
    }
    expect(
      duressGuard(
        recorded({ state: "down", since: 1, deaths: 5, lastError: "boom" }),
      ),
    ).toEqual({ kind: "off", why: "the machine watcher is down" });
  });
});
