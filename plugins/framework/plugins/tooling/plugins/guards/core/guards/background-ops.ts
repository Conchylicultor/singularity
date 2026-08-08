import { defineGuard } from "../define-guard";
import { parseShell } from "../parse-shell";
import type { BashInput } from "../types";

/**
 * Subcommands that take a host slot and run for minutes. From
 * `~/.singularity/op-log.jsonl` over 14 days: build p50 9.8 min / p90 36.8 min,
 * push p50 9.1 min / p90 35.7 min, check p50 3.8 min / p90 18 min.
 */
const LONG_OPS = new Set([
  "build",
  "push",
  "check",
  "test",
  "release",
  "build-composition",
]);

/** Read-only flags that answer instantly and never take a slot. */
const INSTANT_FLAGS = new Set(["--list", "--help", "-h", "--version", "-V"]);

/** Shell-level detach: looks like backgrounding, produces no tracked task. */
const SHELL_DETACH = new Set(["nohup", "setsid", "disown"]);

function longOpIn(cmd: string): string | null {
  for (const call of parseShell(cmd).calls) {
    if (call.name !== "singularity") continue;
    const sub = call.args.find((a) => !a.startsWith("-"));
    if (!sub || !LONG_OPS.has(sub)) continue;
    if (call.args.some((a) => INSTANT_FLAGS.has(a))) continue;
    return sub;
  }
  return null;
}

function shellDetachIn(cmd: string): boolean {
  const calls = parseShell(cmd).calls;
  if (calls.some((c) => SHELL_DETACH.has(c.name))) return true;
  // A trailing `&` survives tokenizing as its own empty segment, so look at the
  // raw text instead — but not `2>&1` / `&>file`, where the `&` is a redirection.
  return /(?<![>&])&\s*$/.test(cmd.trim());
}

/**
 * Long Singularity ops must run as a tool-level background task.
 *
 * The foreground path caps at 600 s, which is below the median build. When it
 * expires the agent gets `Command timed out after 10m 0s` and nothing else — no
 * task id, no notification — while the process keeps running. From there it has
 * no handle on its own op, and the only thing left is to watch the leftover
 * output file, which is exactly the polling `poll-loop` exists to stop. 510 such
 * timeouts appear in 30 days of transcripts.
 *
 * `run_in_background: true` has no timeout (measured task lifetimes of 125, 386
 * and 823 minutes) and answers with "You will be notified when it completes".
 * Forcing every long op through it deletes the handle-less state entirely.
 */
export const backgroundOpsGuard = defineGuard<BashInput>({
  name: "background-ops",
  matcher: "Bash",
  // For the rare op that must be watched live (debugging the build itself).
  bypassToken: ".allow-foreground-ops",
  check(input) {
    const cmd = input.command;
    if (!cmd) return null;

    const op = longOpIn(cmd);
    if (!op) return null;

    if (input.run_in_background === true) {
      if (!shellDetachIn(cmd)) return null;
      return {
        blocked: `This command already runs in the background — the extra shell-level detach (\`&\`/\`nohup\`) breaks it.`,
        why: "Detaching inside the shell makes the task exit immediately, so the harness records a completed task while the op is still running. You are then notified about the wrong thing.",
        hint: `Drop the trailing \`&\` (and any \`nohup\`/\`setsid\`) and keep \`run_in_background: true\`.`,
      };
    }

    if (shellDetachIn(cmd)) {
      return {
        blocked: `\`./singularity ${op}\` is being detached by the shell, which produces no tracked task.`,
        why: "A shell-detached process is invisible to the harness: nothing notifies you when it ends, so the only way to learn the outcome is to watch a file. That is the polling loop this repo is trying to remove.",
        hint: `Drop the \`&\`/\`nohup\` and pass \`run_in_background: true\` on the Bash tool call instead. You will be notified when it completes.`,
      };
    }

    return {
      blocked: `\`./singularity ${op}\` must run with \`run_in_background: true\`.`,
      why: `A ${op} takes about 10 minutes at the median and regularly exceeds the 600 s foreground limit. On timeout you get "Command timed out after 10m 0s" — no task id, no notification — while the op keeps running, leaving you with no handle on it.`,
      hint: `Re-run the same command with \`run_in_background: true\`, then END YOUR TURN. Background tasks have no timeout, and you will be re-invoked with the output when it finishes. Do not sit and watch it.`,
    };
  },
});
