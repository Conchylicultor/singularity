#!/usr/bin/env bun
import { listActiveWorktreeOps } from "@plugins/infra/plugins/worktree/server";
import {
  decideStop,
  outstandingFor,
  releaseAgent,
  type LiveOp,
} from "../core/stop-guard";

/**
 * The `SubagentStop` / `TeammateIdle` hook: an agent may not end its turn while
 * an op it started is still running.
 *
 * A separate entry point from `guard.ts` rather than a branch inside it,
 * because the two answer different questions with different payloads and
 * different output contracts — a PreToolUse hook speaks
 * `hookSpecificOutput.permissionDecision`, a stop hook speaks a top-level
 * `decision`, and Stop explicitly does not support the former.
 *
 * **Fails open, always.** Every path that is not a confident block exits 0 and
 * prints nothing. A hook that throws on an unexpected payload would block an
 * agent for a reason nobody could act on, which is a worse bug than the one
 * this fixes.
 */

interface StopInput {
  session_id?: string;
  /** Present for SubagentStop; absent for a plain Stop, which we never block. */
  agent_id?: string;
  /** TeammateIdle names the teammate instead; either identifies "who is stopping". */
  teammate_name?: string;
  stop_hook_active?: boolean;
  hook_event_name?: string;
}

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
const raw = Buffer.concat(chunks).toString("utf8");

let input: StopInput = {};
if (raw.trim()) {
  try {
    input = JSON.parse(raw) as StopInput;
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    process.exit(0); // malformed payload — never block on it
  }
}

// Who is stopping. `agent_id` for a subagent, the teammate's name for a
// teammate going idle: one identity either way, and the same one
// `background-ops` recorded the op under.
const agentId = input.agent_id ?? input.teammate_name;
const sessionId = input.session_id;
if (!agentId || !sessionId) process.exit(0); // the main conversation: not ours to block

const started = outstandingFor(sessionId, agentId);
// The cheap read first: an agent that never started an op — nearly every stop —
// costs one small file read and no directory scan.
if (started.length === 0) process.exit(0);

const live: LiveOp[] = (await listActiveWorktreeOps()).map((o) => ({
  slug: o.slug,
  op: o.op,
}));

const verdict = decideStop(started, live, input.stop_hook_active === true);
if (verdict.kind === "allow") {
  // Nothing of this agent's is running any more; drop the record so the next
  // stop short-circuits on the cheap read above.
  releaseAgent(sessionId, agentId);
  process.exit(0);
}

process.stdout.write(
  JSON.stringify({ decision: "block", reason: verdict.reason }),
);
