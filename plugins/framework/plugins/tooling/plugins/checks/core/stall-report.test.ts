import { describe, expect, test } from "bun:test";
import {
  CheckThreadStallPayloadSchema,
  STALL_REPORT_MS,
  TOTAL_REPORT_MS,
} from "@plugins/reports/plugins/check-thread-stall/core";
import {
  OutboxEntrySchema,
  type ProcessReport,
} from "@plugins/reports/plugins/outbox/core";
import {
  codePathsOf,
  openStallReporter,
  type StallReportSink,
} from "./stall-report";
import type { OwnerShare } from "./thread-attribution";
import type { ThreadStall, ThreadSummary } from "./thread-watch";

const MERGE_BASE = "d".repeat(40);

function fakeSink(): {
  sink: StallReportSink;
  filed: ProcessReport[];
  mergeBaseCalls: () => number;
} {
  const filed: ProcessReport[] = [];
  let calls = 0;
  return {
    filed,
    mergeBaseCalls: () => calls,
    sink: {
      file: async (report) => {
        filed.push(report);
        return { outcome: "written", path: "/fake" };
      },
      mergeBase: async () => {
        calls += 1;
        return { ok: true, mergeBase: MERGE_BASE };
      },
    },
  };
}

const OWNER: OwnerShare = {
  owner: "check plugin-boundaries",
  samples: 40,
  example: [
    "readdirSync [native]",
    "scan @ plugins/framework/plugins/tooling/plugins/boundaries/check/index.ts:12",
    "resolve @ node_modules/some-pkg/index.js:3",
    "outside @ /opt/elsewhere/file.ts:9",
    "scan @ plugins/framework/plugins/tooling/plugins/boundaries/check/index.ts:30",
  ],
  detail: [],
};

const KINDS = {
  "blocking-io": 30,
  process: 0,
  "module-load": 0,
  cpu: 10,
  native: 0,
};

function stall(lateMs: number): ThreadStall {
  return {
    offsetMs: 500,
    durationMs: lateMs + 50,
    lateMs,
    running: ["plugin-boundaries"],
    bootstrap: [],
    samples: 40,
    owners: [OWNER],
    kinds: KINDS,
    leaves: [],
    cpu: { userMs: 10, systemMs: 5 },
  };
}

function summary(stalledMs: number): ThreadSummary {
  return {
    longestLateMs: 4_000,
    stallCount: 7,
    stalledMs,
    samples: 900,
    rateHz: 40,
    selfMs: 12,
    owners: [],
    kinds: KINDS,
    cpu: { userMs: 1_000, systemMs: 200 },
    stallOwners: [OWNER],
    stalls: [],
  };
}

function reporter(sink: StallReportSink) {
  return openStallReporter({
    worktree: "wt",
    runId: "run-1",
    transcript: "/logs/check-run-1.log",
    sink,
  });
}

describe("openStallReporter", () => {
  test("a stall files at the threshold, and not below it", async () => {
    const { sink, filed } = fakeSink();
    const r = reporter(sink);
    r.stall(stall(STALL_REPORT_MS - 1));
    r.stall(stall(STALL_REPORT_MS));
    await r.settled();
    expect(filed).toHaveLength(1);
    const report = filed[0];
    const data = CheckThreadStallPayloadSchema.parse(report?.data);
    expect(data).toMatchObject({
      trigger: "stall",
      worktree: "wt",
      runId: "run-1",
      transcript: "/logs/check-run-1.log",
      lateMs: STALL_REPORT_MS,
      topOwner: "check plugin-boundaries",
      running: ["plugin-boundaries"],
    });
    expect(report?.message).toBe(
      "check thread stalled 2.0 s — check plugin-boundaries (blocking-io)",
    );
    expect(report?.code).toEqual({
      mergeBase: MERGE_BASE,
      paths: [
        "plugins/framework/plugins/tooling/plugins/boundaries/check/index.ts",
      ],
    });
    // What reaches the outbox must be an entry the drain will accept.
    expect(
      OutboxEntrySchema.safeParse({
        version: 1,
        ...report,
        occurredAt: 0,
        writer: { pid: 1, checkout: "wt" },
      }).success,
    ).toBe(true);
  });

  test("the total files at the threshold, and not below it", async () => {
    const { sink, filed } = fakeSink();
    const below = reporter(sink);
    below.finish(summary(TOTAL_REPORT_MS - 1));
    await below.settled();
    expect(filed).toHaveLength(0);

    const at = reporter(sink);
    at.finish(summary(TOTAL_REPORT_MS));
    await at.settled();
    expect(filed).toHaveLength(1);
    expect(CheckThreadStallPayloadSchema.parse(filed[0]?.data)).toMatchObject({
      trigger: "total",
      stalledMs: TOTAL_REPORT_MS,
      stallCount: 7,
      longestLateMs: 4_000,
    });
  });

  test("the merge-base is read once per run, and never by a run that files nothing", async () => {
    const quiet = fakeSink();
    const q = reporter(quiet.sink);
    q.stall(stall(STALL_REPORT_MS - 1));
    q.finish(summary(0));
    await q.settled();
    expect(quiet.mergeBaseCalls()).toBe(0);

    const loud = fakeSink();
    const l = reporter(loud.sink);
    l.stall(stall(STALL_REPORT_MS));
    l.stall(stall(STALL_REPORT_MS + 500));
    l.finish(summary(TOTAL_REPORT_MS));
    await l.settled();
    expect(loud.filed).toHaveLength(3);
    expect(loud.mergeBaseCalls()).toBe(1);
  });

  test("no branch point: still filed, without a code location", async () => {
    const filed: ProcessReport[] = [];
    const r = reporter({
      file: async (report) => {
        filed.push(report);
        return { outcome: "written", path: "/fake" };
      },
      mergeBase: async () => ({ ok: false, reason: "no main branch" }),
    });
    r.stall(stall(STALL_REPORT_MS));
    await r.settled();
    expect(filed).toHaveLength(1);
    expect(filed[0]?.code).toBeUndefined();
  });

  test("a stall with no samples is owned by `(no samples)`", async () => {
    const { sink, filed } = fakeSink();
    const r = reporter(sink);
    r.stall({ ...stall(STALL_REPORT_MS), owners: [], samples: 0 });
    await r.settled();
    expect(CheckThreadStallPayloadSchema.parse(filed[0]?.data)).toMatchObject({
      topOwner: "(no samples)",
    });
    expect(filed[0]?.code?.paths).toEqual([]);
  });
});

describe("codePathsOf", () => {
  test("keeps repo files only: no native, dependency or out-of-checkout frames", () => {
    expect(codePathsOf([OWNER])).toEqual([
      "plugins/framework/plugins/tooling/plugins/boundaries/check/index.ts",
    ]);
  });
});
