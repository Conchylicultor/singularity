/**
 * The Machine watcher health row's verdict: never green before it is read, loud
 * when main's watcher is down or its process is gone, pulsing while it restarts.
 */

import { describe, expect, it } from "vitest";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import type {
  SentinelStatus,
  SentinelWatch,
} from "@plugins/debug/plugins/sentinel/plugins/status-file/core";
import { machineWatcherVerdict } from "../internal/machine-watcher-health";

const refetch = () => Promise.resolve();

function settled(data: SentinelWatch): ResourceResult<SentinelWatch> {
  return { pending: false, data, refetch };
}

function recorded(
  status: SentinelStatus,
  ownerAlive = true,
): ResourceResult<SentinelWatch> {
  return settled({ kind: "recorded", status, pid: 42, ownerAlive });
}

describe("Machine watcher health row", () => {
  it("is unknown — not ok — while loading", () => {
    expect(
      machineWatcherVerdict({ pending: true, error: null, refetch }),
    ).toEqual({ state: "unknown" });
  });

  it("is unknown with a reason when nothing was recorded or the file is unreadable", () => {
    expect(machineWatcherVerdict(settled({ kind: "none" })).state).toBe(
      "unknown",
    );
    const unreadable = machineWatcherVerdict(
      settled({ kind: "unreadable", reason: "not JSON" }),
    );
    expect(unreadable).toEqual({
      state: "unknown",
      summary: "The machine watcher's status file is unreadable: not JSON",
    });
  });

  it("is ok while running", () => {
    expect(
      machineWatcherVerdict(recorded({ state: "running", since: Date.now() }))
        .state,
    ).toBe("ok");
  });

  it("is critical when down, carrying the last error", () => {
    const verdict = machineWatcherVerdict(
      recorded({
        state: "down",
        since: Date.now(),
        deaths: 5,
        lastError: "runtimeNamespace() not declared",
      }),
    );
    expect(verdict.state).toBe("critical");
    expect("summary" in verdict && verdict.summary).toContain(
      "builds are not held back",
    );
    expect("summary" in verdict && verdict.summary).toContain(
      "runtimeNamespace() not declared",
    );
  });

  it("is critical when the process that wrote 'running' is gone", () => {
    expect(
      machineWatcherVerdict(
        recorded({ state: "running", since: Date.now() }, false),
      ),
    ).toEqual({
      state: "critical",
      summary:
        "Main is not running its machine watcher — builds are not held back when memory runs out",
    });
  });

  it("pulses attention while restarting", () => {
    expect(
      machineWatcherVerdict(
        recorded({
          state: "respawning",
          since: Date.now(),
          deaths: 2,
          lastError: null,
        }),
      ),
    ).toEqual({
      state: "attention",
      summary: "Restarting after 2 crashes",
      transitioning: true,
    });
  });

  it("is attention when turned off, even with main gone", () => {
    expect(
      machineWatcherVerdict(
        recorded({ state: "disabled", since: Date.now() }, false),
      ).state,
    ).toBe("attention");
  });
});
