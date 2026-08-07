import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CheckResult } from "@plugins/framework/plugins/tooling/core";
import {
  pruneWorktreeCheckArtifacts,
  worktreeArtifacts,
} from "@plugins/infra/plugins/paths/core";

/**
 * One settled check, as the transcript renders it. The runner's own outcome type
 * carries more (the `Check` object, timings, the wall start) — none of which the
 * file shows, so this asks only for what it prints.
 */
export interface TranscriptOutcome {
  checkId: string;
  result: CheckResult;
  cached: boolean;
  observations: { line: string; stream: "stdout" | "stderr" }[];
}

/** Indent a possibly-multi-line block by two spaces, every line. */
function indent(text: string): string {
  return `  ${text.split("\n").join("\n  ")}`;
}

/**
 * One settled check's block: the result line, the check's own `ctx.log`
 * observations, and — for a non-passing result — its full message and hint.
 *
 * Pure, and deliberately NOT shared with the console renderer: the console
 * truncates a huge message to protect an agent's context window, which is a
 * console concern and the very reason this file exists. Nothing here is elided.
 */
export function renderOutcomeBlock(outcome: TranscriptOutcome): string[] {
  const { checkId, result, cached, observations } = outcome;
  const lines: string[] = [];

  if (result.ok) {
    lines.push(`• ${checkId} ... ok${cached ? " (cached)" : ""}`);
  } else if (result.inconclusive) {
    lines.push(
      `⚠ ${checkId} ... inconclusive — ${result.message.split("\n")[0]}`,
    );
  } else {
    lines.push(`• ${checkId} ... FAIL`);
  }

  for (const { line } of observations) lines.push(indent(line));

  if (!result.ok) {
    lines.push(indent(result.message));
    if (result.hint) lines.push(`  hint: ${result.hint}`);
  }

  return lines;
}

/** A live run's transcript: the settle-time writer plus its terminal write. */
export interface CheckTranscript {
  /** Where it is being written — the pointer the console hands the reader. */
  readonly path: string;
  /** Record one settled check. Called as each settles, never from a print loop. */
  record(outcome: TranscriptOutcome): void;
  /**
   * Close the run: append `trailer` (the STOP banner, the inconclusive note, or
   * whatever ended the run early), then the `done` line, then prune the family.
   */
  finish(trailer: string[], allOk: boolean): void;
}

/**
 * Open this run's transcript and write its header.
 *
 * The header is written HERE — before a single check runs — because the whole
 * defect this replaces was a file that only existed once every check had
 * settled: a run killed mid-checks wrote nothing and left its predecessor's file
 * behind, so the killed run's own verdict pointed a reader at another run's
 * failures. A file that exists from the first moment cannot do that, and it is
 * readable WHILE the run is in flight, which is exactly when a slow run is
 * interesting.
 *
 * Whole-file re-materialization (`writeFileSync`), never an append: append-mode
 * writers are reserved for the file-sink primitive (`no-adhoc-file-sink`), whose
 * shape — `.jsonl`, 128 MB rotation — does not fit a per-run text artifact. A
 * full run is ~155 lines, so re-writing it per settle is nothing; the family's
 * growth bound is the prune, as with every other per-run artifact.
 */
export function openCheckTranscript(args: {
  worktree: string;
  runId: string;
  scope: string | null;
  /** The ids the caller named, or null for "every check". */
  requested: string[] | null;
}): CheckTranscript {
  const path = worktreeArtifacts.checkLog(args.worktree, args.runId);
  const startedAt = performance.now();

  // Completion-ordered, while the console and build.log stay selection-ordered.
  // Deliberate: this file is read while the run is still going, so "what has
  // finished so far" is the useful order — and a stable one, since a line is
  // only ever written after the check it describes has settled.
  const lines: string[] = [
    `check run ${args.runId}`,
    `  worktree: ${args.worktree}`,
    `  pid:      ${process.pid}`,
    `  scope:    ${args.scope ?? "all"}`,
    `  checks:   ${args.requested ? args.requested.join(", ") : "all"}`,
    `  started:  ${new Date().toISOString()}`,
    "",
  ];

  mkdirSync(dirname(path), { recursive: true });
  const flush = (): void => {
    writeFileSync(path, lines.join("\n") + "\n");
  };
  flush();

  return {
    path,
    record(outcome) {
      lines.push(...renderOutcomeBlock(outcome));
      flush();
    },
    finish(trailer, allOk) {
      lines.push(...trailer);
      lines.push(
        "",
        `done — ${allOk ? "all ok" : "FAILED"} in ${Math.round(performance.now() - startedAt)}ms`,
      );
      flush();
      // Writing a new transcript is what trims the old ones — the same
      // convention every other per-run artifact follows. A killed run skips its
      // prune; the next completed run reaps it.
      pruneWorktreeCheckArtifacts(args.worktree);
    },
  };
}
