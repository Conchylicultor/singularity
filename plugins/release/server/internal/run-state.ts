import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import {
  defineSupervisedRunKind,
  type UnfinishedRun,
} from "@plugins/infra/plugins/jobs/plugins/supervised-run/server";
import type { RunTerminal } from "@plugins/infra/plugins/jobs/plugins/supervised-run/core";
import { releaseOutDir } from "@plugins/release/plugins/bundles/server";
import type { ReleaseIntent } from "../../core/endpoints";
import { _releaseRuns } from "./tables";
import { releaseLog } from "./release-log";
import { deliverTerminal } from "./driving";
import { RELEASE_RUN_KIND_ID } from "./kind-id";
import {
  releaseFailureMessage,
  releaseSucceeded,
  type ReleaseEnding,
} from "./release-outcome";

/** The index the claiming INSERT contends on — see `tables.ts`. */
const INFLIGHT_UQ = "release_runs_inflight_uniq";

/**
 * node-postgres surfaces a unique violation as SQLSTATE 23505 plus the offending
 * constraint. The constraint is checked, not just the code: `release_runs` also
 * has a primary key, and a (vanishingly unlikely) id collision reported as
 * "a release is already running" would be a plausible-looking lie about a
 * different fault.
 */
function isInflightViolation(err: unknown): boolean {
  const pg = err as { code?: string; constraint?: string } | null;
  return pg?.code === "23505" && pg.constraint === INFLIGHT_UQ;
}

/**
 * What one release attempt did.
 *
 * A discriminated result rather than a thrown error, because the interesting
 * non-success — *another release of this composition is already running* — is a
 * legitimate outcome a caller branches on, not a fault. A caller that sequences
 * a release into a larger flow (the Deploy app's `update`) needs to tell "the
 * build refused to start" from "the build ran and failed", and both from an
 * actual bug; a thrown `Error` collapses the first two.
 *
 * `runId` is null exactly when no `release_runs` row was ever claimed.
 */
export type ReleaseOutcome =
  | { ok: true; runId: string; artifactPath: string }
  | {
      ok: false;
      reason: "already-running" | "unimplemented-target" | "failed";
      runId: string | null;
      message: string;
    };

/** The claim's own verdict: the row exists, or somebody else holds the lock. */
export type ReleaseClaim =
  { ok: true; startedAt: Date } | { ok: false; outcome: ReleaseOutcome };

/**
 * Claim the in-flight slot for one composition by INSERTing its ledger row.
 *
 * **The INSERT is the lock.** The partial unique index on
 * `(namespace, composition) WHERE finished_at IS NULL` is what wins or loses the
 * race, so there is no check-then-act window at all. The pre-flight
 * `isAnyReleaseAlive` probe this replaces read every unfinished row and tested
 * its pid — a second copy of the liveness question the reconciler now answers
 * once, and a TOCTOU window besides. Losing the race is not a fault: it is the
 * `already-running` outcome, reached the only way that is safe under
 * concurrency.
 *
 * `startedAt` is written explicitly rather than left to the column default, and
 * handed back: it is the clock the terminal stamp measures the run's duration
 * against, so the claim and the stamp must be reading one value rather than two
 * that happen to agree.
 */
export async function claimRelease(opts: {
  releaseId: string;
  composition: string;
  target: string;
  intent: ReleaseIntent;
}): Promise<ReleaseClaim> {
  const startedAt = new Date();
  try {
    await db.insert(_releaseRuns).values({
      id: opts.releaseId,
      composition: opts.composition,
      target: opts.target,
      startedAt,
      // Stamped from the intent, at claim time — before the CLI has produced
      // anything. What a run WAS FOR is decided by the request, not inferred
      // later from whether an artifact happens to be on disk.
      kind: opts.intent.kind,
      // This backend's own, live pid. It keeps the fresh row from looking like
      // an orphan in the window before the child's pid is known.
      pid: process.pid,
      namespace: currentWorktreeName(),
    });
    return { ok: true, startedAt };
  } catch (err) {
    if (!isInflightViolation(err)) throw err;
    return {
      ok: false,
      outcome: {
        ok: false,
        reason: "already-running",
        runId: null,
        message: `A release of "${opts.composition}" is already running.`,
      },
    };
  }
}

/** The `RELEASE.json` the CLI writes once it has produced an artifact. */
interface ReleaseManifest {
  composition: string;
  target: string;
  platform: string;
  builtAt: string;
  port: number;
  /** Provenance the CLI stamps before its artifact phase; absent on old bundles. */
  commitSha?: string;
  commitDirty?: boolean;
}

function readManifest(out: string): ReleaseManifest | null {
  try {
    return JSON.parse(
      readFileSync(join(out, "RELEASE.json"), "utf-8"),
    ) as ReleaseManifest;
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code !== "ENOENT" &&
      !(err instanceof SyntaxError)
    )
      throw err;
    return null;
  }
}

/** The ledger facts a terminal stamp needs, whoever is doing the stamping. */
export interface ReleaseRunFacts {
  releaseId: string;
  composition: string;
  target: string;
  startedAt: Date;
}

/**
 * Stamp a terminal outcome on the ledger row, and say what it was.
 *
 * ONE function for both arrivals — the sequencer that started the run, and the
 * reconciler adopting a run whose sequencer is gone — so an orphaned release and
 * a watched one cannot be recorded differently. That symmetry is the whole
 * repair: the old orphan path wrote a `-1` sentinel and no message at all, so
 * every restart mid-release produced a row nobody could read.
 *
 * `finishedAt` is the exit marker's **mtime**, never `new Date()` here. A
 * reconcile that stamps its own `now` inflates the run's Duration by the whole
 * gap between the child exiting and something noticing — often the length of a
 * restart — and the row then disagrees with its own transcript.
 *
 * First-writer-wins (`WHERE finished_at IS NULL`), because both arrivals can
 * reach the same row. It is also what releases the composition's in-flight lock,
 * since that lock IS the unfinished row.
 */
export async function stampRelease(
  facts: ReleaseRunFacts,
  terminal: RunTerminal,
): Promise<ReleaseOutcome> {
  const out = releaseOutDir(facts.composition, facts.target, facts.releaseId);
  const manifest = readManifest(out);
  const ending: ReleaseEnding = {
    exitCode: terminal.exitCode,
    signalCode: terminal.signalCode,
    manifest: manifest !== null,
    durationSeconds: Math.round(
      (terminal.finishedAt.getTime() - facts.startedAt.getTime()) / 1000,
    ),
  };
  const succeeded = releaseSucceeded(ending);
  // Computed unconditionally so the row's `error` column and this function's
  // returned `message` are literally the same string: a caller that reports the
  // failure and a user who later opens the run detail must read one sentence,
  // not two wordings of it.
  const failureMessage = releaseFailureMessage(ending);
  releaseLog.publish(succeeded ? "Release succeeded" : failureMessage);

  await db
    .update(_releaseRuns)
    .set({
      finishedAt: terminal.finishedAt,
      exitCode: terminal.exitCode,
      status: succeeded ? "succeeded" : "failed",
      platform: manifest?.platform ?? null,
      artifactPath: succeeded ? out : null,
      port: manifest?.port ?? null,
      // Copied off the manifest, never re-read from git here: the run's source
      // state is what the CLI saw BEFORE its artifact phase, and this backend
      // reads the row long after that tree has moved on.
      commitSha: manifest?.commitSha ?? null,
      commitDirty: manifest?.commitDirty ?? null,
      error: succeeded ? null : failureMessage,
    })
    .where(
      and(
        eq(_releaseRuns.id, facts.releaseId),
        isNull(_releaseRuns.finishedAt),
      ),
    );

  return succeeded
    ? { ok: true, runId: facts.releaseId, artifactPath: out }
    : {
        ok: false,
        reason: "failed",
        runId: facts.releaseId,
        message: failureMessage,
      };
}

/**
 * Close a run that never got as far as a child — the CLI could not be spawned,
 * or a write between the claim and the spawn threw.
 *
 * It has to be closed here rather than left to the reconciler, because the
 * unfinished row IS the composition's in-flight lock: an escaping exception
 * after the claim would otherwise hold that lock until the next boot. There is
 * no exit code, and none is invented — `exit_code` stays null, which no run that
 * actually ran can produce.
 */
export async function failUnstartedRelease(
  releaseId: string,
  message: string,
): Promise<void> {
  await db
    .update(_releaseRuns)
    .set({ finishedAt: new Date(), status: "failed", error: message })
    .where(
      and(eq(_releaseRuns.id, releaseId), isNull(_releaseRuns.finishedAt)),
    );
}

/**
 * The release plugin's supervised-run kind: the adapter between `release_runs`
 * and the one primitive that owns detach, pid, transcript, reconcile and
 * re-attach.
 *
 * Mounted in `register: [...]` (see `../index.ts`) rather than started here, so
 * the kind is registered before the primitive's `onReady` reconciles — a kind
 * defined but never mounted would start runs nothing ever closes.
 *
 * There is no `onReattach`: a release keeps no in-memory live view. Its UI reads
 * the ledger row plus the log channel, and by the time a kind's `onReattach`
 * would be called the primitive has already restarted the transcript tail, so an
 * adopted release is back on screen with nothing for this plugin to rebuild.
 */
export const releaseRunKind = defineSupervisedRunKind({
  id: RELEASE_RUN_KIND_ID,
  channel: releaseLog,
  listUnfinished,
  setPid,
  finish: finishRelease,
});

/**
 * Every release this namespace launched that has not been stamped with an
 * outcome.
 *
 * **Scoped to `namespace`, which is not optional.** A worktree DB is a fork of
 * main's and inherits its rows, so an unscoped read would hand the reconciler
 * another machine's runs — to adopt, to tail transcripts that do not exist here,
 * and to close with an outcome nobody in this namespace observed.
 */
async function listUnfinished(): Promise<readonly UnfinishedRun[]> {
  const rows = await db
    .select({ id: _releaseRuns.id, pid: _releaseRuns.pid })
    .from(_releaseRuns)
    .where(
      and(
        isNull(_releaseRuns.finishedAt),
        eq(_releaseRuns.namespace, currentWorktreeName()),
      ),
    );
  return rows.map((row) => ({ runId: row.id, pid: row.pid }));
}

/** Record the pid of the detached CLI now serving this run. */
async function setPid(releaseId: string, pid: number): Promise<void> {
  await db
    .update(_releaseRuns)
    .set({ pid })
    .where(eq(_releaseRuns.id, releaseId));
}

/**
 * A release has ended. Hand it to the sequencer that started it — or, if there
 * is none, close the row from the ledger alone.
 *
 * The two cases differ in exactly one fact: whether the process that started the
 * run is still here. `deliverTerminal` answers it (see `driving.ts`), so
 * `runRelease` keeps its ordinary awaited shape and the adopting path is the
 * only thing that has to reason about a run it did not start.
 */
async function finishRelease(
  releaseId: string,
  terminal: RunTerminal,
): Promise<void> {
  if (deliverTerminal(releaseId, terminal)) return;
  const [row] = await db
    .select({
      composition: _releaseRuns.composition,
      target: _releaseRuns.target,
      startedAt: _releaseRuns.startedAt,
    })
    .from(_releaseRuns)
    .where(
      and(eq(_releaseRuns.id, releaseId), isNull(_releaseRuns.finishedAt)),
    );
  // Someone stamped it first — the ordinary shape of first-writer-wins, not an
  // error.
  if (row === undefined) return;
  await stampRelease({ releaseId, ...row }, terminal);
}
