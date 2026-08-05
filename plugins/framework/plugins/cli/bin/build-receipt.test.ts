import { test, expect } from "bun:test";
import {
  interruptedPredecessorWarning,
  resolveReceipt,
  type BuildReceipt,
} from "./build-receipt";

function receipt(over: Partial<BuildReceipt> = {}): BuildReceipt {
  return {
    status: "ok",
    buildId: "321c0e2cb-1785922172918",
    commit: "321c0e2cbf7069aaaf065b95c6e4b35fec40b8fb",
    pid: process.pid,
    startedAt: "2026-08-05T11:15:02.114Z",
    finishedAt: "2026-08-05T11:17:44.802Z",
    exitCode: 0,
    url: "http://wt.localhost:9000",
    logPath: "/tmp/build-321c0e2cb.log",
    ...over,
  };
}

/** A pid that is (with overwhelming probability) not a live process. */
async function deadPid(): Promise<number> {
  const proc = Bun.spawn(["true"], { stdout: "ignore", stderr: "ignore" });
  await proc.exited;
  return proc.pid;
}

test("no receipt means no build has ever been recorded here", () => {
  expect(resolveReceipt(null)).toEqual({ kind: "none" });
});

test("terminal statuses pass through unchanged", () => {
  for (const status of ["ok", "failed", "superseded"] as const) {
    expect(resolveReceipt(receipt({ status })).kind).toBe(status);
  }
});

test("running with a live pid is a build in flight", () => {
  const r = receipt({ status: "running", finishedAt: null, exitCode: null });
  expect(resolveReceipt(r).kind).toBe("running");
});

// THE incident case. A SIGKILLed build runs no exit handler, so the terminal
// rewrite never happens and the receipt is left mid-flight by a process that is
// gone. That is the only evidence such a build leaves anywhere.
test("running with a dead pid is an interrupted build", async () => {
  const r = receipt({ status: "running", finishedAt: null, exitCode: null, pid: await deadPid() });
  expect(resolveReceipt(r).kind).toBe("interrupted");
});

test("only an interrupted predecessor produces a warning", async () => {
  const dead = await deadPid();
  const interrupted = resolveReceipt(
    receipt({ status: "running", finishedAt: null, exitCode: null, pid: dead }),
  );
  const warning = interruptedPredecessorWarning(interrupted);
  expect(warning).toContain("never completed");
  expect(warning).toContain("did NOT deploy");
  expect(warning).toContain("321c0e2cb-1785922172918");

  // Every other arm is silent — including `failed`, which already announced
  // itself through the build's own verdict banner and exit code.
  expect(interruptedPredecessorWarning(resolveReceipt(null))).toBeNull();
  for (const status of ["ok", "failed", "superseded"] as const) {
    expect(interruptedPredecessorWarning(resolveReceipt(receipt({ status })))).toBeNull();
  }
  expect(
    interruptedPredecessorWarning(
      resolveReceipt(receipt({ status: "running", finishedAt: null, exitCode: null })),
    ),
  ).toBeNull();
});
