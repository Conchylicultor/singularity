import { PS } from "@plugins/infra/plugins/paths/server";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";

export interface ProcessCandidate {
  pid: number;
  ppid: number;
  command: string;
}

/**
 * The result of the candidate-process probe.
 *
 * A discriminated result rather than `ProcessCandidate[] | null`: "the probe
 * could not run" and "the probe ran and matched nothing" are different facts,
 * and an empty array is a LEGITIMATE finding here (the deleter had already
 * exited). Collapsing them into a nullable array is exactly the absorbable
 * failure the repo forbids — a consumer that forgot the null check would report
 * a failed probe as "no candidates", quietly weakening the evidence in the one
 * report that exists to carry it.
 */
export type ProcessProbe =
  { ok: true; candidates: ProcessCandidate[] } | { ok: false; reason: string };

// Bounded on both axes: this runs on a rare forensic path, but a report payload
// is not a place to dump a full process table.
const MAX_CANDIDATES = 40;
const MAX_COMMAND_CHARS = 200;

// Commands plausibly capable of removing a checkout. Deliberately broad — a
// false positive costs one extra line, a false negative costs the investigation.
const SUSPECT =
  /(^|\/)(git|rm|trash|rsync|find|fd|bash|zsh|sh|node|bun|python3?)(\s|$)/;

/**
 * Parse `ps -axo pid=,ppid=,command=` output into candidates.
 *
 * Pure and exported for tests: parsing is the fragile half, since the command
 * column contains arbitrary spaces and only the first two fields can be split
 * on whitespace.
 */
export function parsePsOutput(
  stdout: string,
  needles: readonly string[],
): ProcessCandidate[] {
  const out: ProcessCandidate[] = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const match = /^(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const command = match[3]!;
    const interesting =
      needles.some((n) => n.length > 0 && command.includes(n)) ||
      SUSPECT.test(command);
    if (!interesting) continue;
    out.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      command: command.slice(0, MAX_COMMAND_CHARS),
    });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

/**
 * Best-effort snapshot of processes that could plausibly be the deleter.
 *
 * `captureProcessTree` (runtime-tmux) was the obvious thing to reuse, but it
 * returns only a pid→children map with no command lines, and a bare pid names
 * nothing once the process has exited. So this takes its own narrower reading.
 */
export async function captureCandidateProcesses(
  needles: readonly string[],
): Promise<ProcessProbe> {
  try {
    const result = await spawnCaptured([PS, "-axo", "pid=,ppid=,command="], {
      timeoutMs: 5_000,
    });
    if (result.timedOut) return { ok: false, reason: "ps timed out after 5s" };
    if (result.exitCode !== 0) {
      return {
        ok: false,
        reason: `ps exited ${result.exitCode}: ${result.stderr.trim() || "<no stderr>"}`,
      };
    }
    return { ok: true, candidates: parsePsOutput(result.stdout, needles) };
  } catch (err) {
    // Not a swallowed failure: every failure mode of the probe (ps missing,
    // spawn refused, decode error) is returned as an explicit `ok: false` arm
    // the caller must branch on, and the reason is carried into the report.
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
