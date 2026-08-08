#!/usr/bin/env bun
/**
 * Replays the poll-loop detection rule over recorded Claude Code transcripts and
 * reports what it would have caught.
 *
 * The point is that the guard's effectiveness is MEASURED, not asserted. The
 * rule this replaced keyed on byte-identical consecutive commands and looked
 * reasonable; run against real sessions it caught 2 of 47 loops. Re-run this
 * after any change to `core/poll-detect.ts`.
 *
 *   bun plugins/framework/plugins/tooling/plugins/guards/e2e/replay-transcripts.ts
 *   bun …/replay-transcripts.ts --days 60 --verbose
 *
 * Only the detection rule is replayed. The guard's liveness arm (deny while the
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

/**
 * Floors for `--assert`. Measured 2026-08-08 over a 30-day window: 104 sessions
 * tripped, 1783 calls prevented. The floors sit well under that because the
 * corpus is a MOVING window — sessions age out — so a modest drift is expected
 * and only a collapse means the rule itself regressed.
 */
const FLOOR_SESSIONS = 60;
const FLOOR_PREVENTED = 1000;

interface ToolCall {
  ts: number;
  name: string;
  cmd: string;
}

interface SessionResult {
  session: string;
  trippedAt: string[];
  /** Observational calls the agent still made after the guard would have stopped it. */
  prevented: number;
  observations: number;
}

function parseArgs(argv: string[]): { days: number; verbose: boolean } {
  const days = Number(argv[argv.indexOf("--days") + 1]);
  return {
    days: argv.includes("--days") && Number.isFinite(days) ? days : 30,
    verbose: argv.includes("--verbose"),
  };
}

function readToolCalls(file: string): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line || !line.includes('"tool_use"')) continue;
    let entry: {
      type?: string;
      timestamp?: string;
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
      input?: { command?: string };
    }[]) {
      if (block.type !== "tool_use" || !block.name) continue;
      calls.push({
        ts: Date.parse(entry.timestamp ?? "") || 0,
        name: block.name,
        cmd: block.input?.command ?? "",
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

const { days, verbose } = parseArgs(process.argv.slice(2));
const since = Date.now() - days * 24 * 3600 * 1000;

const results: SessionResult[] = [];
let scanned = 0;

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
    scanned++;
    const outcome = replay(readToolCalls(path));
    if (outcome.trippedAt.length > 0) {
      results.push({
        session: `${project.replace(/^.*worktrees-/, "")}/${file.slice(0, 8)}`,
        ...outcome,
      });
    }
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
