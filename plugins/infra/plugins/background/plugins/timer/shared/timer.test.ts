import { describe, expect, test } from "bun:test";
import {
  defineTimerIn,
  listTimerEntries,
  timerRecentRuns,
  type TimerRuntime,
} from "./timer";

function runtime(overrides: Partial<TimerRuntime> = {}): TimerRuntime & {
  failures: unknown[];
  changes: string[];
} {
  const failures: unknown[] = [];
  const changes: string[] = [];
  return {
    scope: "every-worktree",
    runsHere: true,
    declaredIn: () => "test.plugin",
    onFailure: (_name, err) => {
      failures.push(err);
    },
    changed: (name) => {
      changes.push(name);
    },
    failures,
    changes,
    ...overrides,
  };
}

/** Let an `immediate` tick (a detached promise) settle. */
async function settle(): Promise<void> {
  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));
}

describe("defineTimerIn", () => {
  test("refuses to start before it is registered", () => {
    const t = defineTimerIn(
      {
        name: "t.unregistered",
        description: "d",
        everyMs: 60_000,
        run: () => {},
      },
      runtime(),
    );
    expect(() => t.start()).toThrow(/before it was registered/);
  });

  test("refuses to start where its runtime says it does not run", () => {
    const t = defineTimerIn(
      { name: "t.main-only", description: "d", everyMs: 60_000, run: () => {} },
      runtime({ runsHere: false }),
    );
    t.register();
    expect(() => t.start()).toThrow(/main-only/);
  });

  test("an immediate tick runs on start and is listed as a succeeded run", async () => {
    let ticks = 0;
    const rt = runtime();
    const t = defineTimerIn(
      {
        name: "t.immediate",
        description: "Ticks.",
        everyMs: 60_000,
        immediate: true,
        run: () => {
          ticks++;
        },
      },
      rt,
    );
    t.register();
    t.start();
    await settle();
    t.stop();
    expect(ticks).toBe(1);
    const entry = listTimerEntries().find((e) => e.name === "t.immediate")!;
    expect(entry.trigger).toEqual({ kind: "interval", everyMs: 60_000 });
    expect(entry.declaredIn).toBe("test.plugin");
    expect(entry.lastRun?.outcome).toBe("succeeded");
    expect(entry.history).toMatchObject({ runs: 1, failures: 0 });
    expect(rt.changes).toContain("t.immediate");
  });

  test("a throwing tick is recorded as failed and handed to onFailure", async () => {
    const rt = runtime();
    const boom = new Error("boom");
    const t = defineTimerIn(
      {
        name: "t.failing",
        description: "Fails.",
        everyMs: 60_000,
        immediate: true,
        profile: "invisible",
        run: () => {
          throw boom;
        },
      },
      rt,
    );
    t.register();
    t.start();
    await settle();
    t.stop();
    expect(rt.failures).toEqual([boom]);
    const [run] = await timerRecentRuns("t.failing");
    expect(run?.outcome).toBe("failed");
    expect(run?.error).toBe("boom");
    expect(
      listTimerEntries().find((e) => e.name === "t.failing")!.history,
    ).toMatchObject({ runs: 1, failures: 1 });
  });

  test("a duplicate name is refused at registration", () => {
    const spec = {
      name: "t.dup",
      description: "d",
      everyMs: 60_000,
      run: () => {},
    };
    defineTimerIn(spec, runtime()).register();
    expect(() => defineTimerIn(spec, runtime()).register()).toThrow(
      /duplicate/,
    );
  });
});
