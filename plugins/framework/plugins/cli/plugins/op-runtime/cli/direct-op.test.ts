import { describe, expect, test } from "bun:test";
import type {
  Grant,
  Lane,
} from "@plugins/infra/plugins/host/plugins/host-admission/core";
import { asNamespace } from "@plugins/infra/plugins/namespace/core";
import type {
  OpEvent,
  OpSummary,
} from "@plugins/debug/plugins/profiling/plugins/op-log/core";
import { createOpProfiler } from "@plugins/debug/plugins/profiling/plugins/op-log/server";
import { withDirectOp, type DirectOpDeps } from "./direct-op";

// Pure-logic tests of the direct-op lifecycle: every seam injected (no real
// flock, no marker file, no op-log append, no signal handler), so what is
// asserted is the ORDER and the GATING — the two things the three hand-rolled
// copies this replaced could disagree about.

function fakeGrant(units: number, lane: Lane): Grant {
  return {
    units,
    run: (fn) => fn(),
    env: () => ({
      SINGULARITY_HOST_GRANT: String(units),
      SINGULARITY_HOST_LANE: lane,
    }),
  };
}

/**
 * Await `p` and return the Error it rejected with; throw if it resolved.
 * `expect(p).rejects.toThrow()` is typed `void` under bun:test (the same helper
 * the spawn and host-semaphore suites carry), so this asserts the rejection for
 * real and hands back the error.
 */
async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected the promise to reject, but it resolved");
}

/** The terminal summary, or undefined when no `completed` event landed. */
function terminalOf(records: OpEvent[]): OpSummary | undefined {
  const last = records.find((r) => r.e === "completed");
  return last?.e === "completed" ? last.summary : undefined;
}

function makeHarness(opts: { inherited?: Grant; slug?: string } = {}) {
  const events: string[] = [];
  const records: OpEvent[] = [];
  const exitHandlers: (() => void)[] = [];
  const slug = asNamespace(opts.slug ?? "wt-a");
  const deps: DirectOpDeps = {
    inheritedGrant: () => opts.inherited,
    withHostGrant: async (o, fn) => {
      events.push(`acquire:${o.lane}:${o.max}`);
      o.hooks?.onWaitStart?.();
      o.hooks?.onAcquired?.(0);
      try {
        return await fn(fakeGrant(2, o.lane));
      } finally {
        events.push("release");
      }
    },
    identity: async () => ({ slug, branch: "feature" }),
    checkBroadcasts: async (kind) => {
      events.push(`broadcasts:${kind}`);
    },
    reportInterruptedPredecessor: (s) => {
      events.push(`predecessor:${s}`);
    },
    publishLane: (interactive) => {
      events.push(`lane:${interactive ? "interactive" : "background"}`);
    },
    // The requested / completed events land in `events` too, so the ORDER
    // against the marker (publish before `requested`, release after
    // `completed`) is asserted, not assumed.
    createOpProfiler: (kind, o) =>
      createOpProfiler(kind, {
        ...o,
        sink: (r) => {
          records.push(r);
          if (r.e === "requested" || r.e === "completed")
            events.push(`log:${r.e}`);
        },
      }),
    markWorktreeOpStart: (_slug, op, _opId) => {
      events.push(`marker:${op}:publish`);
      let released = false;
      return {
        path: "/dev/null",
        release: () => {
          if (released) return;
          released = true;
          events.push(`marker:${op}:release`);
        },
      };
    },
    onExit: (fn) => exitHandlers.push(fn),
    installFatalSignalExit: (opId) => {
      events.push(`signals:${opId.length > 0 ? "armed" : "?"}`);
    },
    // `_slug` above: the stubs record the op, not the slug — every call in a
    // run carries the same one, asserted once through `predecessor:<slug>`.
  };
  return { deps, events, records, exitHandlers };
}

describe("withDirectOp — top-level path", () => {
  test("runs the whole lifecycle in order and stamps the body's outcome", async () => {
    const h = makeHarness();
    const seen: string[] = [];
    const outcome = await withDirectOp(
      "test",
      { max: 4 },
      async (grant, ctx) => {
        seen.push(`body:${grant.units}:${ctx.nested}:${ctx.lane}`);
        expect(ctx.profiler).toBeDefined();
        return "success";
      },
      h.deps,
    );
    expect(outcome).toBe("success");
    expect(seen).toEqual(["body:2:false:background"]);
    // The marker is published BEFORE `requested` and released only AFTER
    // `completed` is in the log: a reader never sees a logged op without a
    // locked marker unless its process died.
    expect(h.events).toEqual([
      "broadcasts:test",
      "predecessor:wt-a",
      "lane:background",
      "marker:test:publish",
      "log:requested",
      "signals:armed",
      "acquire:background:4",
      "release",
      "log:completed",
      "marker:test:release",
    ]);
    expect(h.records.map((r) => r.e)).toContain("granted");
    const completed = terminalOf(h.records);
    expect(completed?.kind).toBe("test");
    expect(completed?.outcome).toBe("success");
    expect(completed?.waits.map((w) => w.kind)).toEqual(["host-grant"]);
    // The exit handler (the `process.exit` inside a body path, which skips the
    // finally) is idempotent: no second terminal, no second release.
    for (const fn of h.exitHandlers) fn();
    expect(h.events.filter((e) => e.startsWith("log:completed"))).toHaveLength(
      1,
    );
    expect(h.events.filter((e) => e === "marker:test:release")).toHaveLength(1);
  });

  test("the main worktree is the interactive origin", async () => {
    const h = makeHarness({ slug: "singularity" });
    await withDirectOp("e2e", { max: 1 }, async () => "success", h.deps);
    expect(h.events).toContain("lane:interactive");
    expect(h.events).toContain("acquire:interactive:1");
  });

  test("a failed body is stamped failed; a throwing body still writes its terminal, then releases", async () => {
    const h = makeHarness();
    const outcome = await withDirectOp(
      "check",
      { max: 1 },
      async () => "failed",
      h.deps,
    );
    expect(outcome).toBe("failed");
    for (const fn of h.exitHandlers) fn();
    expect(terminalOf(h.records)?.outcome).toBe("failed");

    const h2 = makeHarness();
    const err = await rejection(
      withDirectOp(
        "check",
        { max: 1 },
        async () => {
          throw new Error("boom");
        },
        h2.deps,
      ),
    );
    expect(err.message).toBe("boom");
    expect(h2.events.slice(-2)).toEqual([
      "log:completed",
      "marker:check:release",
    ]);
    // No outcome was stamped, so the terminal record lands as "error".
    expect(terminalOf(h2.records)?.outcome).toBe("error");
  });

  test("a top-level op mints its own id; an adopted id is honoured", async () => {
    const h = makeHarness();
    let minted = "";
    await withDirectOp(
      "test",
      { max: 1 },
      async (_g, ctx) => {
        minted = ctx.opId;
        return "success";
      },
      h.deps,
    );
    expect(minted.length).toBeGreaterThan(0);
    expect(h.records[0]?.opId).toBe(minted);

    const h2 = makeHarness();
    await withDirectOp(
      "check",
      { max: 1, opId: "parent-op" },
      async (_g, ctx) => {
        expect(ctx.opId).toBe("parent-op");
        return "success";
      },
      h2.deps,
    );
  });
});

describe("withDirectOp — nested path (a parent's grant in the environment)", () => {
  test("spends the inherited grant and writes nothing of its own", async () => {
    const inherited = fakeGrant(3, "interactive");
    const h = makeHarness({ inherited });
    const outcome = await withDirectOp(
      "check",
      { max: 99 },
      async (grant, ctx) => {
        expect(grant).toBe(inherited);
        expect(ctx.nested).toBe(true);
        expect(ctx.profiler).toBeUndefined();
        return "success";
      },
      h.deps,
    );
    expect(outcome).toBe("success");
    // Only the lane is published (not-clobbered by the real publishLane); no
    // banner, no predecessor, no marker, no signal handlers, no acquire.
    expect(h.events).toEqual(["lane:background"]);
    expect(h.records).toEqual([]);
    expect(h.exitHandlers).toEqual([]);
  });
});
