import {
  WAIT_KINDS,
  liveTimes,
  type OpLiveTimes,
} from "@plugins/debug/plugins/profiling/plugins/op-log/core";
import {
  opRowToFoldState,
  type OpRow,
} from "@plugins/debug/plugins/profiling/plugins/op-log/plugins/op-store/core";
import { OP_KINDS, type OpKind } from "@plugins/infra/plugins/worktree/core";
import { formatElapsed } from "@plugins/primitives/plugins/relative-time/web";

// The pure half of the banner, the queue and the chip: which op a worktree
// shows, how its state reads, and how the global push queue orders. Every
// surface renders these same strings, so they cannot disagree.

/**
 * A worktree's slug: the basename of its checkout path — what the op log files
 * an op under (`opSlug`). Derived by hand: no node:path in the browser.
 */
export function slugOf(worktreePath: string): string {
  const parts = worktreePath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? worktreePath;
}

/**
 * The worktree an op ran in. `opSlug`, or — for a legacy line that carried none
 * — the last segment of its branch (`claude-web/att-x` → `att-x`), which is the
 * same id by the basename invariant.
 */
export function opSlugOf(row: OpRow): string {
  return row.opSlug ?? slugOf(row.branch);
}

// Which op a worktree shows when it somehow has several in flight: a push
// (global-lock-contended, highest stakes) outranks a check, which outranks a
// build; a test or an e2e run contends for the host grant only and yields the
// display slot. `Record<OpKind, …>` keeps it complete: a kind without a rank is
// a type error.
const OP_RANK: Record<OpKind, number> = {
  push: 4,
  check: 3,
  build: 2,
  test: 1,
  e2e: 1,
};

/** The worktree's in-flight ops, the one it shows first (by `OP_RANK`, then oldest). */
export function opsOfSlug(rows: readonly OpRow[], slug: string): OpRow[] {
  return rows
    .filter((r) => opSlugOf(r) === slug)
    .sort(
      (a, b) =>
        OP_RANK[b.kind] - OP_RANK[a.kind] ||
        a.requestedAt.getTime() - b.requestedAt.getTime(),
    );
}

/** Waited vs worked at `now`, off the reducer's one derivation. */
export function timesOf(row: OpRow, now: number): OpLiveTimes {
  return liveTimes(opRowToFoldState(row), now);
}

/**
 * The one state line: `Build — held: host under duress (loadRatio) · requeue #6
 * · 12:03` while parked in a wait (the clock is that wait's own), `Build —
 * Building` while working.
 */
export function stateLine(row: OpRow, now: number): string {
  const { label, progressive } = OP_KINDS[row.kind];
  const wait = row.openWait;
  if (!wait) return `${label} — ${progressive}`;
  const requeue = wait.cycle > 0 ? ` · requeue #${wait.cycle}` : "";
  const clock = formatElapsed(timesOf(row, now).openWaitMs);
  return `${label} — ${WAIT_KINDS[wait.kind].sentence(wait.reason)}${requeue} · ${clock}`;
}

/** `waited 1:22:10 · worked 9:04`, or null when the op never meaningfully waited. */
export function splitLine(times: OpLiveTimes): string | null {
  if (times.waitingMs < 1000) return null;
  return `waited ${formatElapsed(times.waitingMs)} · worked ${formatElapsed(times.workingMs)}`;
}

/** One row of the expanded list. `queuePos` is the 1-based global push-queue position. */
export interface QueueRow {
  row: OpRow;
  slug: string;
  queuePos: number | null;
  isSelf: boolean;
}

const byTime =
  (at: (r: OpRow) => number) =>
  (a: OpRow, b: OpRow): number =>
    at(a) - at(b);
const requestedMs = (r: OpRow) => r.requestedAt.getTime();

/**
 * Every in-flight op, ordered: the global push queue first — `#1` the push that
 * holds the mutex (granted), then the pushes parked on the mutex in the order
 * they joined it, then any push not yet at the mutex — then every other op
 * (builds, checks, tests, e2e runs, which serialize per worktree or on the host
 * grant and have no global queue position) by request time.
 */
export function buildQueue(
  rows: readonly OpRow[],
  selfSlug: string,
): QueueRow[] {
  const pushes = rows.filter((r) => r.kind === "push");
  const holders = pushes
    .filter((r) => r.grantedAt !== null)
    .sort(byTime((r) => r.grantedAt?.getTime() ?? 0));
  const ungranted = pushes.filter((r) => r.grantedAt === null);
  const onMutex = ungranted
    .filter((r) => r.openWait?.kind === "push-mutex")
    .sort(byTime((r) => Date.parse(r.openWait?.startedAt ?? "")));
  const beforeMutex = ungranted
    .filter((r) => r.openWait?.kind !== "push-mutex")
    .sort(byTime(requestedMs));
  const others = rows
    .filter((r) => r.kind !== "push")
    .sort(byTime(requestedMs));

  const toRow = (row: OpRow, queuePos: number | null): QueueRow => {
    const slug = opSlugOf(row);
    return { row, slug, queuePos, isSelf: slug === selfSlug };
  };
  return [
    ...[...holders, ...onMutex, ...beforeMutex].map((r, i) => toRow(r, i + 1)),
    ...others.map((r) => toRow(r, null)),
  ];
}
