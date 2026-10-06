// The relay's Claude Code hook entry, as data: this plugin owns the one place
// its command and its never-time-out rule are spelled. The server resolves the
// script's absolute path (server/internal/relay-hook.ts) and the launch
// (runtime-tmux) merges the entry into its one `--settings` object.

/**
 * The hook's timeout, in seconds: about 23 days, under `setTimeout`'s 24.8-day
 * ceiling. Verified on CLI 2.1.291 (research/2026-10-06-…-hook-relay.md, Phase 0
 * finding 3): the value goes straight into a `setTimeout`, unclamped. The relay
 * never gives up on a timer — only a release, an answer, or a backend that
 * stays unreachable ends it — so this only has to be "never" in practice.
 */
export const RELAY_HOOK_TIMEOUT_S = 2_000_000;

/** Shown as the CLI's spinner text while the relay holds the call. */
export const RELAY_STATUS_MESSAGE = "Waiting for your answer in Singularity…";

// The command crosses two shells (the pane's single-quoted `--settings`, then
// the CLI's own hook shell), so the path is held to a plain-path alphabet
// rather than escaped for both.
const SAFE_PATH_RE = /^\/[A-Za-z0-9_./ +-]+$/;

export interface RelayHookEntry {
  type: "command";
  command: string;
  timeout: number;
  statusMessage: string;
}

/**
 * The PreToolUse hook entry that runs the relay script at `scriptPath`
 * (absolute).
 */
export function questionRelayHook({
  scriptPath,
}: {
  scriptPath: string;
}): RelayHookEntry {
  if (!SAFE_PATH_RE.test(scriptPath)) {
    throw new Error(
      `question relay script path ${JSON.stringify(scriptPath)} must be absolute ` +
        `and plain (it is spliced into a hook command)`,
    );
  }
  return {
    type: "command",
    command: `bun "${scriptPath}"`,
    timeout: RELAY_HOOK_TIMEOUT_S,
    statusMessage: RELAY_STATUS_MESSAGE,
  };
}
