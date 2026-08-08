import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { worktreeArtifacts } from "@plugins/infra/plugins/paths/core";
import { defineGuard } from "../define-guard";
import type { Denial, Inform } from "../define-guard";
import {
  classify,
  detectPoll,
  pruneWindow,
  THRESHOLD,
  watchSubjects,
  type WatchSubject,
  type WindowEntry,
} from "../poll-detect";
import type { BashInput, GuardContext } from "../types";

interface State {
  window: WindowEntry[];
  /** Subjects already denied once — a repeat escalates. */
  tripped: WatchSubject[];
}

const EMPTY: State = { window: [], tripped: [] };

function stateFile(sessionId: string): string {
  return join(tmpdir(), `guard-poll-loop-${sessionId}.json`);
}

function loadState(path: string): State {
  if (!existsSync(path)) return { ...EMPTY };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<State>;
    return { window: parsed.window ?? [], tripped: parsed.tripped ?? [] };
  } catch (err) {
    // A torn or hand-edited state file must not block the agent's next call.
    if (
      !(err instanceof SyntaxError) &&
      (err as NodeJS.ErrnoException).code == null
    )
      throw err;
    return { ...EMPTY };
  }
}

/* ------------------------------------------------------------------ liveness */

/**
 * Is the thing being watched still running? Decides whether a repeated look is
 * a wait (deny — something else will wake you) or forensics on a finished op
 * (allow — reading a completed build's log four times is legitimate work).
 */
type Liveness =
  | { kind: "harness-task"; id: string }
  | { kind: "running"; what: string }
  | { kind: "finished"; what: string; verdict: string }
  | { kind: "unknown" };

interface RawReceipt {
  status?: string;
  pid?: number;
  startedAt?: string;
  exitCode?: number | null;
  url?: string;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH: gone. EPERM: alive but owned by another user.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function minutesSince(iso: string | undefined): string {
  if (!iso) return "";
  const started = Date.parse(iso);
  if (Number.isNaN(started)) return "";
  return ` (started ${Math.round((Date.now() - started) / 60000)}m ago)`;
}

function receiptLiveness(worktree: string): Liveness {
  let raw: RawReceipt;
  try {
    raw = JSON.parse(
      readFileSync(worktreeArtifacts.buildStatus(worktree), "utf8"),
    ) as RawReceipt;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT")
      return { kind: "unknown" };
    if (err instanceof SyntaxError) return { kind: "unknown" };
    throw err;
  }
  const what = `the build in ${worktree}`;
  // `running` with a dead pid means killed before it could rewrite the receipt —
  // still finished, just without a verdict of its own.
  if (raw.status === "running") {
    return raw.pid != null && pidAlive(raw.pid)
      ? {
          kind: "running",
          what: `${what}${minutesSince(raw.startedAt)}, pid ${raw.pid}`,
        }
      : {
          kind: "finished",
          what,
          verdict:
            "interrupted — the build process died without writing a verdict",
        };
  }
  if (raw.status == null) return { kind: "unknown" };
  return {
    kind: "finished",
    what,
    verdict: `${raw.status}${raw.exitCode != null ? ` (exit ${raw.exitCode})` : ""}`,
  };
}

function livenessOf(subjects: WatchSubject[]): Liveness {
  for (const s of subjects) {
    if (s.startsWith("task:"))
      return { kind: "harness-task", id: s.slice("task:".length) };
  }
  for (const s of subjects) {
    if (s.startsWith("receipt:build:")) {
      const wt = s.slice("receipt:build:".length);
      if (wt !== "self") return receiptLiveness(wt);
    }
    if (s.startsWith("pid:")) {
      const pid = Number(s.slice("pid:".length));
      if (Number.isFinite(pid)) {
        return pidAlive(pid)
          ? { kind: "running", what: `pid ${pid}` }
          : {
              kind: "finished",
              what: `pid ${pid}`,
              verdict: "the process has exited",
            };
      }
    }
  }
  return { kind: "unknown" };
}

/* -------------------------------------------------------------------- message */

function denialFor(
  liveness: Liveness,
  subjects: WatchSubject[],
  fatal: boolean,
): Denial {
  const watching = subjects.join(", ");
  const base = {
    blocked: `This is the 4th look at the same thing (${watching}) with no work in between — a polling loop.`,
    fatal,
  };

  switch (liveness.kind) {
    case "harness-task":
      return {
        ...base,
        why: `Background task ${liveness.id} is tracked by the harness. When it exits you are re-invoked automatically with its output — that is what "You will be notified when it completes" meant.`,
        hint: "END YOUR TURN now. Do not check the task again; there is nothing to see until it finishes, and you will be woken when it does.",
      };
    case "running":
      return {
        ...base,
        why: `${liveness.what} is still running. Watching it costs a turn per look and changes nothing.`,
        hint: "END YOUR TURN. If this op is one of your own background tasks you will be re-invoked when it finishes. If it is not, say so to the user rather than waiting on it.",
      };
    case "finished":
      return {
        ...base,
        why: `${liveness.what} is already finished: ${liveness.verdict}. You are watching something that has stopped changing.`,
        hint: "Read the result once and act on it. Do not look again.",
      };
    case "unknown":
      return {
        ...base,
        why: "Nothing here is going to wake you: this is not one of your background tasks, so no notification is coming no matter how long you watch.",
        hint: "STOP and tell the user what you are waiting for and why. If you started this op yourself, re-run it with `run_in_background: true` so its completion notifies you.",
      };
  }
}

/* ---------------------------------------------------------------------- guard */

/**
 * Blocks the loop where an agent spends turns watching something finish.
 *
 * Measured over 30 days of transcripts: 47 sessions contained a run of 6+
 * consecutive calls observing one thing, 528 calls in those runs alone. The
 * guard this replaces keyed on byte-identical consecutive commands and caught 2
 * of them — in 40 of the 45 misses the longest identical streak was 1, because
 * incidental drift (`tail -25` → `-40`) is enough to defeat byte-equality.
 *
 * The identity here is the SUBJECT being watched, so drift does not help. See
 * `../poll-detect.ts` for the rule and `e2e/replay-transcripts.ts` for its
 * measured catch rate.
 */
export const pollLoopGuard = defineGuard<BashInput>({
  name: "poll-loop",
  matcher: "Bash",
  check(input, ctx: GuardContext): Denial | Inform | null {
    const cmd = input.command?.trim();
    if (!cmd) return null;

    const path = stateFile(ctx.sessionId);
    const state = loadState(path);
    const now = Date.now();
    const kind = classify(cmd);

    // Real work happened — whatever the agent was waiting on, it is no longer
    // just waiting. Forget the looks that came before.
    if (kind === "mutate") {
      writeFileSync(
        path,
        JSON.stringify({ window: [], tripped: [] } satisfies State),
      );
      return null;
    }
    if (kind === "neutral") return null;

    const subjects = watchSubjects(cmd);
    const { repeated, tripped } = detectPoll(subjects, state.window, now);

    if (!tripped) {
      state.window = pruneWindow(
        [...state.window, { t: now, s: subjects }],
        now,
      );
      writeFileSync(path, JSON.stringify(state));
      return null;
    }

    const liveness = livenessOf(subjects);

    // Forensics on something already finished is legitimate — answer the
    // question instead of blocking it, and let the window keep filling.
    if (liveness.kind === "finished") {
      state.window = pruneWindow(
        [...state.window, { t: now, s: subjects }],
        now,
      );
      writeFileSync(path, JSON.stringify(state));
      return {
        inform: `You have now looked at ${repeated.join(", ")} ${THRESHOLD} times. It is finished: ${liveness.verdict}. Nothing further will change — read the result and move on.`,
      };
    }

    const seenBefore = repeated.some((s) => state.tripped.includes(s));
    state.tripped = [...new Set([...state.tripped, ...repeated])];
    writeFileSync(path, JSON.stringify(state));

    return denialFor(liveness, repeated, seenBefore);
  },
});
