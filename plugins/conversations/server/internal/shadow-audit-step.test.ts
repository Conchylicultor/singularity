import { describe, expect, test } from "bun:test";
import {
  auditStep,
  OPEN_MISS_MS,
  type AuditFinding,
  type Divergence,
} from "./shadow-audit-step";

const WORKING = 'patch {"status":"working"}';
const WAITING = 'patch {"status":"waiting"}';

/** Drive ticks: each `[now, diverging, signals]` is one audit tick. */
function run(
  ticks: Array<[number, Record<string, string>, Record<string, number>?]>,
): AuditFinding[] {
  const divergences = new Map<string, Divergence>();
  const signals = new Map<string, number>();
  const findings: AuditFinding[] = [];
  for (const [now, diverging, signalled] of ticks) {
    for (const [id, at] of Object.entries(signalled ?? {})) signals.set(id, at);
    findings.push(
      ...auditStep(
        divergences,
        new Map(Object.entries(diverging)),
        (id) => signals.get(id),
        now,
      ),
    );
  }
  return findings;
}

describe("auditStep", () => {
  test("a signal fix after 2 s is late, not missed", () => {
    // conv-1791321671-ov6h on 2026-10-06: fixed by a signal ~2.2 s in.
    expect(
      run([
        [0, { a: WAITING }],
        [1000, { a: WAITING }],
        [2000, { a: WAITING }],
        [3000, {}, { a: 2200 }],
      ]),
    ).toEqual([
      { kind: "late", id: "a", signature: WAITING, divergedForMs: 3000 },
    ]);
  });

  test("a fix with no signal since it was last seen is a sweep fix: missed", () => {
    // The signal reconcile ran BEFORE the divergence began (class A: the
    // transcript appeared after the sessions-file wake).
    expect(
      run([
        [0, { a: WORKING }, { a: -800 }],
        [1000, { a: WORKING }],
        [30_000, { a: WORKING }],
        [31_000, {}],
      ]),
    ).toEqual([
      {
        kind: "missed",
        id: "a",
        signature: WORKING,
        divergedForMs: 31_000,
        resolvedBy: "sweep",
      },
    ]);
  });

  test("a signal that ran mid-divergence without fixing it does not count", () => {
    expect(
      run([
        [0, { a: WORKING }],
        [1000, { a: WORKING }, { a: 500 }],
        [5000, { a: WORKING }],
        [6000, {}],
      ]).map((f) => f.kind),
    ).toEqual(["missed"]);
  });

  test("an unfixed divergence is reported once, when it passes OPEN_MISS_MS", () => {
    const findings = run([
      [0, { a: WORKING }],
      [OPEN_MISS_MS - 1000, { a: WORKING }],
      [OPEN_MISS_MS, { a: WORKING }],
      [OPEN_MISS_MS + 1000, { a: WORKING }],
      [OPEN_MISS_MS + 2000, {}],
    ]);
    expect(findings).toEqual([
      {
        kind: "missed",
        id: "a",
        signature: WORKING,
        divergedForMs: OPEN_MISS_MS,
        resolvedBy: "open",
      },
    ]);
  });

  test("a divergence gone within 2 s is no finding, by any path", () => {
    expect(
      run([
        [0, { a: WORKING }],
        [1000, {}],
      ]),
    ).toEqual([]);
    expect(
      run([
        [0, { a: WORKING }],
        [1000, {}, { a: 900 }],
      ]),
    ).toEqual([]);
  });

  test("a changed verdict resolves the old divergence and starts a new one", () => {
    const findings = run([
      [0, { a: WORKING }],
      [3000, { a: WAITING }, { a: 2500 }],
      [4000, { a: WAITING }],
      [5000, {}, { a: 4500 }],
    ]);
    expect(findings).toEqual([
      { kind: "late", id: "a", signature: WORKING, divergedForMs: 3000 },
      { kind: "late", id: "a", signature: WAITING, divergedForMs: 2000 },
    ]);
  });
});
