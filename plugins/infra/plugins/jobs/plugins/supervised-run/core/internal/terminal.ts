import { statSync, readFileSync } from "node:fs";
import {
  currentWorktreeName,
  worktreeArtifacts,
} from "@plugins/infra/plugins/paths/core";
import { assertRunId, assertRunKindId } from "./ids";

/**
 * The marker body: `<status> <signal-or-dash>`, one line, exactly two fields.
 *
 * Two fields rather than a bare number because the status alone cannot say
 * whether a signal arrived (see {@link RunTerminal.signalCode}), and a fixed
 * shape rather than JSON because the writer is `sh` — `printf '%s %s\n'` is a
 * format two lines of shell cannot get subtly wrong, and this regex is a parse
 * rather than a hopeful `parseInt`.
 */
const MARKER_BODY = /^(\d{1,3}) (-|[A-Z][A-Z0-9]{1,9})$/;

/** How the shim spells "no signal was observed" in the marker's second field. */
const NO_SIGNAL = "-";

/**
 * A marker file that exists but does not parse.
 *
 * Its own type so the reconciler can report it as itself. It is a defect in the
 * writer, never an ordinary run state — the file is published by rename, so
 * there is no partial-write story that makes this benign.
 */
export class RunMarkerError extends Error {
  constructor(
    readonly path: string,
    readonly body: string,
  ) {
    super(
      `[supervised-run] malformed exit marker at ${path}: ${JSON.stringify(body)} — ` +
        `expected "<status> <signal-or-dash>", e.g. "0 -" or "143 TERM".`,
    );
    this.name = "RunMarkerError";
  }
}

/** How a supervised run ended: the child's status, at the instant it ended. */
export interface RunTerminal {
  /**
   * The child's exit status, in the shell's own convention — `128 + signo` for
   * a signalled death, so a SIGTERM reads as 143 exactly as it does everywhere
   * else in this repo (`buildStatusOf`, `killedSignalName`).
   *
   * **Not sufficient on its own to tell a kill from an exit** — see
   * {@link RunTerminal.signalCode}.
   */
  exitCode: number;
  /**
   * The signal that killed the run (`"TERM"`, `"INT"`, `"HUP"` — bare POSIX
   * names, no `SIG` prefix), or `null` when no signal was observed.
   *
   * **This field exists because the exit code cannot answer the question.**
   * POSIX reports a signalled child as `128 + signo`, so `kill -TERM` and a
   * program that deliberately calls `exit(143)` produce the identical number.
   * A run record that cannot separate them is what produced
   * `drun-1787890652933-wr3v6d`: a `ship` killed 0.9 s after spawn by an
   * unrelated `./singularity build` restarting its parent backend, recorded and
   * shown as `Exited with code 143` — a sentence about a command that never
   * exited and never refused. `verb-outcome.ts`'s own docblock is the long
   * form of this paragraph; do not re-derive killed-ness from `exitCode > 128`
   * anywhere, because that is the same guess wearing a different hat.
   *
   * Recorded by the shim's trap, so it is an **observation**, not an inference
   * (see `supervisedArgv`). Read `null` as "not observed as killed" rather than
   * "exited normally": the one gap is a child signalled individually with `sh`
   * left untouched, which nothing in this system does — every kill here goes to
   * the process group.
   *
   * Note the deliberate asymmetry with a hard SIGKILL, which yields **no marker
   * at all** and therefore the `-1` sentinel with `signalCode: null`. SIGKILL
   * runs no handler, so there is no shell left to observe anything; absence is
   * the only evidence it can leave, and `-1` is a code no child can produce, so
   * the two cases stay distinguishable.
   */
  signalCode: string | null;
  /**
   * When the child ended. The marker file's **mtime**, never the instant this
   * function ran.
   *
   * The build plugin went out of its way to recover the true instant and states
   * why (`run-build.ts`'s `readBuildTerminal`): a reconcile pass that stamps its
   * own `now` inflates the row's Duration by the whole gap between the child
   * exiting and something noticing — often many minutes after a restart, and
   * the run's Duration then disagrees with its own transcript. Release does use
   * `now` and is wrong for it. mtime gives every kind the right answer for free,
   * and is the reason the marker file holds only a number: a timestamp the
   * shell had to format is a second thing to get right, in `sh`, for no gain.
   */
  finishedAt: Date;
}

/**
 * The status stamped on a run that left **no exit marker at all** — a hard
 * SIGKILL, which runs no shell, so nothing was there to record anything.
 *
 * A status no child can produce, which is what keeps the case legible without
 * anyone claiming a signal name they did not observe (`signalCode` is null
 * alongside it, deliberately — see {@link RunTerminal.signalCode}).
 *
 * Exported rather than left a literal in the reconciler because it is not the
 * reconciler's private business: every consumer that turns a `RunTerminal` into
 * a sentence has to recognise it, and the alternative — each of them spelling
 * `-1` again next to a comment explaining it — is the shape a value drifts out
 * of. Deploy's `verb-outcome.ts` carried exactly that copy.
 */
export const HARD_KILL_EXIT_CODE = -1;

/**
 * Whether OS process `pid` is currently alive. `process.kill(pid, 0)` sends no
 * signal; it throws ESRCH when the process is gone. EPERM means the process
 * exists but is owned by another user — still alive.
 *
 * THE one copy. It was hand-rolled in `run-build.ts` and again in
 * `run-release.ts`, and the two agreed only by luck — the EPERM arm is the easy
 * one to forget, and forgetting it reads a live foreign-owned child as dead.
 */
export function isPidAlive(pid: number | null): boolean {
  if (pid == null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Read the terminal record of one supervised run, or `null` when the run has
 * not reached a terminal a shell could record.
 *
 * A non-null return is a race-free "this run has finished" signal, because of
 * WHO writes the file and WHEN: the POSIX shim wrapping every supervised argv
 * writes it once, atomically (tmp + rename), after `wait` on the child returns
 * and before the shim itself exits. It is never written mid-run and never
 * rewritten, so a reconcile may act on it even while the shim's pid is still
 * alive for the moment before it reaps.
 *
 * `null` means one of two things, and they are deliberately not distinguished
 * here — the caller composes this with {@link isPidAlive}, and the pair says
 * which:
 *
 * - the run is still going (no marker yet, pid alive), or
 * - the child was **hard**-killed: SIGKILL runs no shell, so nothing ever wrote
 *   the marker and nothing ever will (no marker, pid dead) ⇒ the `-1` sentinel,
 *   exactly as build does today.
 *
 * ENOENT is therefore an ordinary answer, not an error. A marker that EXISTS
 * but does not parse is the opposite — it throws {@link RunMarkerError}. The
 * file is published by rename and never rewritten, so a reader cannot catch a
 * partial write; malformed bytes mean the shim wrote something it should never
 * have written, and answering `null` would file that under "hard-killed" and
 * hide a real defect behind a plausible-looking `-1`. Any other read error is a
 * genuine fault and rethrows.
 */
export function readRunTerminal(
  kindId: string,
  runId: string,
): RunTerminal | null {
  assertRunKindId(kindId);
  assertRunId(kindId, runId);
  const path = worktreeArtifacts.runTerminal(
    currentWorktreeName(),
    kindId,
    runId,
  );
  let raw: string;
  let mtime: Date;
  try {
    // stat BEFORE read, so the mtime can never be newer than the bytes it is
    // being attributed to. The file is published by rename and never rewritten,
    // so the two observations describe one immutable file either way; this is
    // the ordering that stays correct if that ever stops being true.
    mtime = statSync(path).mtime;
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return null;
  }
  const match = MARKER_BODY.exec(raw.trim());
  if (match === null) throw new RunMarkerError(path, raw);
  const [, code, signal] = match;
  return {
    exitCode: Number(code),
    // `-` is how the shim spells "no signal observed"; anything else is the
    // name its trap clause carried.
    signalCode: signal === NO_SIGNAL ? null : (signal ?? null),
    finishedAt: mtime,
  };
}
