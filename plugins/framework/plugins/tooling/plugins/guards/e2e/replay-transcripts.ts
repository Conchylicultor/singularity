#!/usr/bin/env bun
/**
 * Replays the guards over recorded Claude Code transcripts and reports what they
 * would have done.
 *
 * The point is that a guard's effectiveness is MEASURED, not asserted. The poll
 * rule this replaced keyed on byte-identical consecutive commands and looked
 * reasonable; run against real sessions it caught 2 of 47 loops.
 *
 *   …/replay-transcripts.ts                 the poll rule (default)
 *   …/replay-transcripts.ts --days 60 --verbose
 *   …/replay-transcripts.ts --guards        every Bash guard, denials and why
 *   …/replay-transcripts.ts --guards --assert
 *
 * Re-run the default mode after any change to `core/poll-detect.ts`, and
 * `--guards` after any change to `core/parse-shell.ts` — the parser is the one
 * input every Bash guard shares, so a change there can blind all of them at once.
 *
 * Only the detection rules are replayed. A guard's liveness arm (deny while the
 * watched op runs, inform once it has finished) depends on filesystem state that
 * no longer exists for a historical session, so it is out of scope here and is
 * covered by the unit tests instead.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CLAUDE_PROJECTS_DIR } from "@plugins/infra/plugins/paths/core";
import {
  classify,
  detectPoll,
  pruneWindow,
  watchSubjects,
  type WindowEntry,
} from "../core/poll-detect";
import { createContext } from "../core/context";
import { parseShell } from "../core/parse-shell";
import { backgroundOpsGuard } from "../core/guards/background-ops";
import { findGuard } from "../core/guards/find";
import { gitPushGuard } from "../core/guards/git-push";
import { gitResetMainGuard } from "../core/guards/git-reset-main";
import { mainWritesGuard } from "../core/guards/main-writes";
import { migrationsGuard } from "../core/guards/migrations";
import { postgresGuard } from "../core/guards/postgres";
import { rgReplaceGuard } from "../core/guards/rg-replace";
import type { Guard } from "../core/types";

/**
 * Floors for `--assert`. Measured 2026-08-08 over a 30-day window: 104 sessions
 * tripped, 1783 calls prevented. The floors sit well under that because the
 * corpus is a MOVING window — sessions age out — so a modest drift is expected
 * and only a collapse means the rule itself regressed.
 */
const FLOOR_SESSIONS = 60;
const FLOOR_PREVENTED = 1000;

/**
 * Floors for `--guards --assert`. Measured 2026-08-18 over 30 days: 1309 denials
 * across 23.5k Bash calls, 28 of them on a command carrying a heredoc.
 *
 * These two catch the opposite failure from the ceiling: a pre-pass that
 * swallows real commands, blinding every guard at once, shows up as a collapse
 * here long before anyone notices the guards have gone quiet.
 */
const FLOOR_BASH_DENIES = 1000;
const FLOOR_HEREDOC_DENIALS = 10;

/**
 * The Bash guards that decide from the command alone.
 *
 * `poll-loop` (tmpdir session state) and `git-diff-main` (a
 * `.git-diff-main-reminded` marker) WRITE to disk when they run, so replaying
 * them would mutate the machine; the poll rule is the default mode's job anyway.
 */
const PURE_GUARDS: Guard<unknown>[] = [
  findGuard,
  rgReplaceGuard,
  gitPushGuard,
  gitResetMainGuard,
  migrationsGuard,
  mainWritesGuard,
  postgresGuard,
  backgroundOpsGuard,
] as Guard<unknown>[];

const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);

interface ToolCall {
  ts: number;
  name: string;
  cmd: string;
  /** The session's own cwd for this call — a sibling worktree is not main. */
  cwd: string;
  bg: boolean;
}

interface SessionResult {
  session: string;
  trippedAt: string[];
  /** Observational calls the agent still made after the guard would have stopped it. */
  prevented: number;
  observations: number;
}

function parseArgs(argv: string[]): {
  days: number;
  verbose: boolean;
  guards: boolean;
} {
  const days = Number(argv[argv.indexOf("--days") + 1]);
  return {
    days: argv.includes("--days") && Number.isFinite(days) ? days : 30,
    verbose: argv.includes("--verbose"),
    guards: argv.includes("--guards"),
  };
}

function readToolCalls(file: string): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line || !line.includes('"tool_use"')) continue;
    let entry: {
      type?: string;
      timestamp?: string;
      cwd?: string;
      message?: { content?: unknown };
    };
    try {
      entry = JSON.parse(line) as typeof entry;
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
      continue; // a torn final line while the session is still being written
    }
    if (entry.type !== "assistant" || !Array.isArray(entry.message?.content))
      continue;
    for (const block of entry.message.content as {
      type?: string;
      name?: string;
      input?: { command?: string; run_in_background?: boolean };
    }[]) {
      if (block.type !== "tool_use" || !block.name) continue;
      calls.push({
        ts: Date.parse(entry.timestamp ?? "") || 0,
        name: block.name,
        cmd: block.input?.command ?? "",
        cwd: entry.cwd ?? "/tmp",
        bg: block.input?.run_in_background === true,
      });
    }
  }
  return calls;
}

function replay(calls: ToolCall[]): Omit<SessionResult, "session"> {
  let window: WindowEntry[] = [];
  const trippedAt: string[] = [];
  let prevented = 0;
  let observations = 0;

  for (const call of calls) {
    // The harness's own background-output readers are observations of that task.
    const isHarnessRead =
      call.name === "BashOutput" || call.name === "TaskOutput";
    if (!isHarnessRead && call.name !== "Bash") continue;

    const kind = isHarnessRead ? "observe" : classify(call.cmd);
    if (kind === "mutate") {
      window = [];
      continue;
    }
    if (kind === "neutral") continue;

    const subjects = isHarnessRead ? ["task:harness"] : watchSubjects(call.cmd);
    if (subjects.length === 0) continue;
    observations++;

    // After the first trip the agent would have stopped; everything further is
    // what the guard saves.
    if (trippedAt.length > 0) {
      prevented++;
      continue;
    }
    if (detectPoll(subjects, window, call.ts).tripped) {
      trippedAt.push(subjects.join(","));
      continue;
    }
    window = pruneWindow([...window, { t: call.ts, s: subjects }], call.ts);
  }
  return { trippedAt, prevented, observations };
}

/** Every transcript touched within the window, as `[label, path]`. */
function sessionFiles(since: number): [string, string][] {
  const out: [string, string][] = [];
  for (const project of readdirSync(CLAUDE_PROJECTS_DIR)) {
    const dir = join(CLAUDE_PROJECTS_DIR, project);
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOTDIR") continue;
      throw err;
    }
    for (const file of files) {
      const path = join(dir, file);
      if (statSync(path).mtimeMs < since) continue;
      out.push([
        `${project.replace(/^.*worktrees-/, "")}/${file.slice(0, 8)}`,
        path,
      ]);
    }
  }
  return out;
}

const { days, verbose, guards } = parseArgs(process.argv.slice(2));
const since = Date.now() - days * 24 * 3600 * 1000;
const corpus = sessionFiles(since);

if (guards) {
  replayGuards(corpus, days, verbose);
  process.exit(0);
}

const results: SessionResult[] = [];
let scanned = 0;

for (const [session, path] of corpus) {
  scanned++;
  const outcome = replay(readToolCalls(path));
  if (outcome.trippedAt.length > 0) {
    results.push({ session, ...outcome });
  }
}

results.sort((a, b) => b.prevented - a.prevented);
const prevented = results.reduce((sum, r) => sum + r.prevented, 0);

console.log(`\nReplayed ${scanned} sessions over the last ${days} days.\n`);
console.log(`  sessions where the guard trips : ${results.length}`);
console.log(`  polling calls prevented        : ${prevented}\n`);

console.log("top 15 by calls prevented:");
for (const r of results.slice(0, 15)) {
  console.log(
    `  ${String(r.prevented).padStart(4)} of ${String(r.observations).padStart(4)} obs  ${r.session.padEnd(34)} [${r.trippedAt[0]?.slice(0, 46)}]`,
  );
}

if (verbose) {
  console.log("\nlowest-yield trips (audit these for false positives):");
  for (const r of results.slice(-15)) {
    console.log(
      `  ${String(r.prevented).padStart(4)} prevented  ${r.session.padEnd(34)} [${r.trippedAt[0]?.slice(0, 46)}]`,
    );
  }
}

if (!process.argv.includes("--assert")) process.exit(0);

const regressed =
  results.length < FLOOR_SESSIONS || prevented < FLOOR_PREVENTED;
console.log(
  regressed
    ? `REGRESSED — floor is ${FLOOR_SESSIONS} sessions / ${FLOOR_PREVENTED} calls prevented.`
    : `OK — at or above the ${FLOOR_SESSIONS} session / ${FLOOR_PREVENTED} call floor.`,
);
process.exit(regressed ? 1 : 0);

function denialsFor(call: ToolCall, command: string): string[] {
  // The session's OWN cwd, not a synthetic root: to a sibling worktree, another
  // worktree's path looks like main, and `main-writes` would mis-report.
  const ctx = createContext(call.cwd, "replay");
  const denied: string[] = [];
  for (const guard of PURE_GUARDS) {
    const verdict = guard.check(
      { command, run_in_background: call.bg } as never,
      ctx as never,
    );
    if (verdict instanceof Promise) continue;
    if (verdict.kind === "deny") denied.push(guard.name);
  }
  return denied;
}

/**
 * Replay every Bash guard over the corpus.
 *
 * The number that matters is `body-sourced denials with no interpreter`: a
 * denial the full command earns but its own executable text does not, on a
 * command that runs no shell over the body. That is a document being written
 * and refused as a command — the bug the heredoc model exists to make
 * impossible, so its ceiling is a hard 0 rather than a drifting floor.
 */
function replayGuards(
  corpus: [string, string][],
  days: number,
  verbose: boolean,
): void {
  const perGuard = new Map<string, number>();
  const bodySourced: { session: string; guard: string; cmd: string }[] = [];
  let bash = 0;
  let denied = 0;
  let heredocs = 0;
  let heredocDenials = 0;
  let interpreterBodies = 0;

  for (const [session, path] of corpus) {
    for (const call of readToolCalls(path)) {
      if (call.name !== "Bash" || !call.cmd) continue;
      bash++;
      const names = denialsFor(call, call.cmd);
      for (const n of names) perGuard.set(n, (perGuard.get(n) ?? 0) + 1);
      if (names.length > 0) denied++;

      const parsed = parseShell(call.cmd);
      if (parsed.code === call.cmd) continue;
      heredocs++;
      if (names.length === 0) continue;
      heredocDenials++;

      // A denial the executable text does not earn on its own came from a body.
      const fromCode = new Set(denialsFor(call, parsed.code));
      const fromBody = names.filter((n) => !fromCode.has(n));
      if (fromBody.length === 0) continue;
      if (parsed.calls.some((c) => SHELLS.has(c.name))) {
        interpreterBodies++;
        continue;
      }
      for (const guard of fromBody)
        bodySourced.push({ session, guard, cmd: call.cmd });
    }
  }

  console.log(
    `\nReplayed ${corpus.length} sessions over the last ${days} days.\n`,
  );
  console.log(`  Bash calls                       : ${bash}`);
  console.log(`  denied by at least one guard     : ${denied}`);
  console.log(`  commands carrying a heredoc      : ${heredocs}`);
  console.log(`  … of those, denied               : ${heredocDenials}`);
  console.log(`  … denied via an interpreter body : ${interpreterBodies}`);
  console.log(`  … denied via a DATA body         : ${bodySourced.length}\n`);

  console.log("denials per guard:");
  for (const [name, n] of [...perGuard].sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(5)}  ${name}`);

  if (bodySourced.length > 0 || verbose) {
    console.log("\ndocument writes refused as commands (these are the bug):");
    for (const b of bodySourced.slice(0, 20))
      console.log(
        `  ${b.guard.padEnd(16)} ${b.session.padEnd(34)} ${b.cmd.replace(/\n/g, "\\n").slice(0, 70)}`,
      );
  }

  if (!process.argv.includes("--assert")) return;

  const failures: string[] = [];
  if (bodySourced.length > 0)
    failures.push(`${bodySourced.length} document writes denied (ceiling 0)`);
  if (denied < FLOOR_BASH_DENIES)
    failures.push(`${denied} denials, floor ${FLOOR_BASH_DENIES}`);
  if (heredocDenials < FLOOR_HEREDOC_DENIALS)
    failures.push(
      `${heredocDenials} heredoc denials, floor ${FLOOR_HEREDOC_DENIALS}`,
    );
  console.log(
    failures.length > 0
      ? `\nREGRESSED — ${failures.join("; ")}.`
      : `\nOK — no document write denied; ${denied} real denials stand.`,
  );
  process.exitCode = failures.length > 0 ? 1 : 0;
}
