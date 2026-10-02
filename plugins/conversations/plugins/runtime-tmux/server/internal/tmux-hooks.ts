import { TMUX } from "@plugins/infra/plugins/paths/server";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import { tmuxSignalsDir } from "../../data-dirs";

// The global tmux hooks that turn a session's life events into a touched file
// under the signal dir, which every backend watches (signals.ts). They are what
// makes a dead agent visible at once instead of at the next sweep: tmux has no
// other change signal a backend can subscribe to.
//
// Verified on tmux 3.6a against a private server (`tmux -L`):
//   - `session-closed` fires for a program's normal exit, `kill-session`, and a
//     SIGKILL of the pane's process, and `#{hook_session_name}` names the closed
//     session inside `run-shell`;
//   - `pane-exited` leaves `#{hook_session_name}` EMPTY, so it names the session
//     through `#{session_name}` (it matters only for a pane kept by
//     `remain-on-exit`, whose session does not close);
//   - `session-created` + `#{hook_session_name}` names the new session.
//
// A fixed array index makes re-installing idempotent and leaves every other hook
// — the user's own included — untouched. 73 has no meaning beyond being one
// index nobody else is likely to pick.
const HOOK_INDEX = 73;

// A path is spliced into a tmux command string, which tmux parses and then hands
// to /bin/sh. Rather than escape for two parsers (and tmux's own `#{…}` format
// expansion), refuse anything outside a plain-path alphabet — loud, at the first
// install, on a machine whose data root would need it.
const SAFE_PATH_RE = /^[A-Za-z0-9_./ +-]+$/;

/** The signal dir, asserted safe to splice unquoted-by-tmux into a shell command. */
export function signalDirForCommands(dir: string): string {
  if (!SAFE_PATH_RE.test(dir)) {
    throw new Error(
      `tmux signal dir ${JSON.stringify(dir)} contains characters that cannot be ` +
        `spliced into a tmux hook / Claude Code hook command safely`,
    );
  }
  return dir;
}

/**
 * The `set-hook` invocations, as tmux argv (without the binary). Pure, so the
 * exact hook strings are unit-tested.
 */
export function tmuxHookCommands(dir: string): string[][] {
  const safe = signalDirForCommands(dir);
  const touch = (name: string) => `run-shell -b "touch '${safe}/${name}'"`;
  return [
    [
      "set-hook",
      "-g",
      `session-created[${HOOK_INDEX}]`,
      touch("#{hook_session_name}"),
    ],
    [
      "set-hook",
      "-g",
      `session-closed[${HOOK_INDEX}]`,
      touch("#{hook_session_name}"),
    ],
    ["set-hook", "-g", `pane-exited[${HOOK_INDEX}]`, touch("#{session_name}")],
  ];
}

/**
 * The same hooks as a tail to chain onto another tmux command (`new-session …
 * \; set-hook …`). The tmux server exits with its last session and forgets its
 * hooks, so the first `create()` on a fresh server must re-arm them — in the
 * same invocation, so no session can ever run on an unhooked server.
 */
export function chainedTmuxHookArgs(): string[] {
  return tmuxHookCommands(tmuxSignalsDir.ensure()).flatMap((cmd) => [
    ";",
    ...cmd,
  ]);
}

/**
 * Arm the hooks on the running tmux server, at boot. No server is a legitimate
 * state — there is nothing to hook, and the next `create()` starts one with the
 * hooks chained in. Any other failure throws.
 */
export async function installTmuxHooks(): Promise<void> {
  const dir = tmuxSignalsDir.ensure();
  const args = tmuxHookCommands(dir).flatMap((cmd, i) =>
    i === 0 ? cmd : [";", ...cmd],
  );
  const { exitCode: exit, stderr } = await spawnCaptured([TMUX, ...args], {
    // A wedge-breaker far above a set-hook's milliseconds: boot awaits this.
    timeoutMs: 10_000,
  });
  if (exit === 0) return;
  if (/no server running|error connecting to/i.test(stderr)) return;
  throw new Error(
    `tmux set-hook failed (exit ${exit}): ${stderr.trim() || "<no stderr>"}`,
  );
}
