// What environment does an agent's shell start from?
//
// Not ours. The tmux server is started by whichever process first talks to the
// default socket — in practice the main backend, after a machine restart — and
// it keeps that process's environment for its whole life. Every `tmux
// new-session` forks from the server, so every agent pane on the box inherited
// the main backend's variables: its namespace, its Unix socket path, its cwd.
// Nobody chose that; the panes simply picked them up. `-e` only ADDS to what
// the server already carries, so it cannot undo any of it.
//
// So the pane's first act is to throw its environment away and rebuild it from
// a closed set. The exec'd process is a login zsh that immediately re-execs
// `env -i <allowlist> zsh -l -c '<claude command>'`: the outer shell exists
// only to expand `$NAME` (it is the one process that can still see tmux's
// injected TMUX / TMUX_PANE and the two `-e` values), and the inner login shell
// starts from exactly this list, rebuilding PATH from the user's own profile.
//
// Why an allowlist and not `tmux set-environment -g -u` per bad variable: the
// set of things a backend's ambient environment may carry is open-ended, so
// naming the bad ones only ever catches the last leak somebody noticed. An
// allowlist makes the tmux server's environment irrelevant by construction.
//
// TMUX_PANE is load-bearing and must stay in the list: tier-1 pane ownership
// (see this plugin's CLAUDE.md) matches a Claude session file's `tmux` stamp
// against the pane it claims, and the CLI can only stamp what it inherits.
export const AGENT_SESSION_ENV_ALLOWLIST = [
  // Identity. Under `env -i` zsh reconstructs HOME from the passwd entry but
  // reads LOGNAME from getlogin(), which on this host answers the console
  // owner rather than the running uid — so all three are passed explicitly.
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  // Terminal + locale. TERM is set by tmux for the pane; the locale variables
  // may be unset upstream, in which case they arrive empty, which POSIX
  // already treats as "not set" for locale resolution.
  "TERM",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  // tmux's own injection. TMUX_PANE is how a Claude session claims its pane.
  "TMUX",
  "TMUX_PANE",
  // The two the runtime delivers with `-e`: the conversation id the
  // prepare-commit-msg hook stamps trailers from, and the host Claude's
  // .mcp.json dials back to.
  "SINGULARITY_CONVERSATION_ID",
  "SINGULARITY_PARENT_HOST",
  // Also delivered with `-e`: pins the Claude session to this pane, so it can
  // never migrate into Claude Code's background daemon and inherit whichever
  // pane first spawned that daemon (the Sep 9 misattributed push). See the
  // spawn site in tmux-runtime.ts.
  "CLAUDE_CODE_DISABLE_AGENT_VIEW",
] as const;

// A minimal PATH so early rc lines that shell out (path_helper itself lives in
// /usr/libexec but is invoked as a plain command by /etc/zprofile) still work.
// The inner login shell replaces this with the user's real PATH.
export const AGENT_SESSION_PATH_SEED = "/usr/bin:/bin:/usr/sbin:/sbin";

// The command string tmux execs, as `zsh -l -c <wrapper> zsh <claudeCmd> [prompt]`.
//
// Nothing is interpolated into it: the Claude command rides in as `$1` and the
// prompt as `$2`, so a command containing single quotes (`--settings '{…}'`)
// needs no escaping and cannot be re-parsed on the way through. After `shift`,
// `"$@"` is the prompt when there is one and expands to nothing when there is
// not — which is what keeps the existing contract that a short prompt reaches
// Claude as the inner shell's `$1`.
export const AGENT_SESSION_WRAPPER = [
  'cmd="$1"; shift; exec env -i',
  ...AGENT_SESSION_ENV_ALLOWLIST.map((name) => `${name}="$${name}"`),
  `PATH=${AGENT_SESSION_PATH_SEED}`,
  'zsh -l -c "$cmd" zsh "$@"',
].join(" ");
