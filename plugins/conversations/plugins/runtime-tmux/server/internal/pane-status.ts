/**
 * Pure resolution of a Claude Code pane's status verdict from the two signals it
 * exposes: the tmux pane title and the CLI's own session file. No tmux / I/O
 * here on purpose — the precedence rule between the two signals is the
 * correctness-critical part and it is unit-tested in pane-status.test.ts.
 * tmux-runtime.ts owns the captures and passes the raw values through here.
 */

import type { SessionState } from "./claude-session";

// Busy frames the CLI animates in the terminal title. Three generations coexist:
// braille (≤ 2.1.226), the half-circles CLI 2.1.228 switched to ("Updated
// terminal title busy-spinner glyphs to reduce tab-bar jitter"), and no
// animation at all (≥ 2.1.236, which renders READY_RE throughout a turn). All
// the frames are kept because a machine can be running any of those versions —
// but an unrecognised frame is now only a cosmetic miss: it leaves the glyph in
// the title we mirror into `conversations.title`, while the status verdict comes
// from the session file (see resolveWorking).
const SPINNER_RE = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠐⠂⠄⠠⠈◐◑◒◓]\s*/;
const READY_RE = /^✳\s*/;
const STATUS_PREFIX_RE = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠐⠂⠄⠠⠈◐◑◒◓✳]\s*/;

// Sessions we manage: new ones use `conv-…`; `claude-…` is the pre-rename
// legacy prefix kept so zombie sessions still get picked up by the poller.
const SESSION_NAME_RE = /^(conv|claude)-\d+(-[a-z0-9]+)?$/;

export interface ResolvedPaneStatus {
  title: string;
  working: boolean;
  waitingFor: string | null;
}

/**
 * Merge the two status sources for a tmux pane into a single verdict.
 *
 * 1. Pid JSON session file (~/.claude/sessions/<pid>.json) — the AUTHORITY:
 *    - status: "busy" | "idle" | "shell" | "waiting", written by the CLI on
 *      every transition
 *    - waitingFor: human-readable reason (only meaningful when not busy)
 *
 * 2. Tmux pane title prefix — a PROMOTE-ONLY hint:
 *    - Spinner glyph → working
 *    - anything else → no opinion
 *
 * The title may only ever promote to working, never demote to waiting. That
 * direction is load-bearing, not stylistic. The title is a rendering decision
 * the CLI is free to change, and it has changed twice: v2.1.228 swapped the
 * braille spinner for half-circles, and v2.1.236 stopped animating the title
 * altogether — a busy agent now renders the SAME `✳` ready mark it renders when
 * idle. Under the previous title-first rule that reported every agent on the new
 * CLI as waiting, silently and fleet-wide, while the session file said "busy"
 * throughout. A demoting title turns a cosmetic CLI change into a status
 * blackout; a promote-only title can at worst lose a hint the file already
 * carries.
 */
export function resolvePaneStatus(
  rawTitle: string,
  session: SessionState,
  opActive: boolean,
): ResolvedPaneStatus {
  const trimmed = rawTitle.replace(/^_ /, "").trim();

  // Extract display title (strip status prefix).
  const titleText = trimmed.replace(STATUS_PREFIX_RE, "").trim();
  const isDefault =
    !titleText ||
    /^[a-zA-Z0-9-]+\.(local|internal|lan|home)$/.test(titleText) ||
    SESSION_NAME_RE.test(titleText);
  const title = isDefault ? "" : titleText;

  const working = resolveWorking(trimmed, session, opActive);
  const waitingFor = working ? null : (session.waitingFor ?? null);
  return { title, working, waitingFor };
}

function resolveWorking(
  trimmed: string,
  session: SessionState,
  opActive: boolean,
): boolean {
  if (session.status == null) {
    // No session record for this pane — the file isn't written yet (startup
    // race) or the pane hosts a CLI too old to write one. The title is the only
    // signal there is, so here, and ONLY here, it decides in both directions.
    // Absent even a ready mark, assume working: a just-spawned pane is
    // mid-startup, not waiting on the user.
    return !READY_RE.test(trimmed);
  }

  // "shell" is the CLI's ambiguous state: it is written whenever a background
  // task is attached AND the agent is sitting at the `❯` prompt — identical
  // whether that background task is a build/push which will finish and resume
  // the agent, or a never-ending one (a dev server, `tail -f`, a build whose
  // completion marker never matched) it will wait on forever. Only Singularity
  // knows which: `opActive` is our own per-worktree marker saying a build or
  // push is genuinely in flight. Without it, "shell" reads as waiting, so a
  // stalled agent surfaces in the needs-input queue instead of looking busy
  // forever — see research/2026-06-03-global-fix-shell-status-stuck-working.md.
  const fileWorking =
    session.status === "busy" || (session.status === "shell" && opActive);

  return fileWorking || SPINNER_RE.test(trimmed);
}
