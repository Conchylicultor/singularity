/**
 * Pure classification of a Claude Code pane capture into "which interactive
 * menu, if any, is open right now". No tmux / I/O here on purpose — deciding a
 * LIVE menu from a footer left behind in scrollback is the correctness-critical
 * part (a false positive fires Escape into a working agent), so it is unit
 * tested in pane-menu.test.ts. tmux-runtime.ts owns the capture and passes the
 * raw text through here.
 *
 * Why screen-scrape at all: the CLI's own session file does not distinguish a
 * blocked AskUserQuestion from an ordinary idle wait. It has reported
 * `waitingFor: "permission prompt"` (v2.1.159) and `waitingFor: "input needed"`
 * (v2.1.276) for the very same open question menu, and both spellings are what
 * it writes when nothing is on screen at all. The menu's own footer is the only
 * signal that separates them.
 */

// Every interactive menu footer — question OR rewind — terminates in the
// segment "Esc to cancel". Finding it is step one; step two is proving the menu
// it belongs to is still on screen (see composerBelow).
const FOOTER_TERMINATOR_RE = /Esc to cancel\b/i;

// A long footer HARD-WRAPS across terminal lines: extra control segments
// ("· n to add notes · Tab to switch questions ·") widen it past the pane and
// push "Esc to cancel" onto its own line, so the control anchors no longer
// share one physical line. The CLI emits the break itself (tmux's `-J`
// wrap-join does not rejoin it), so we rejoin the last few lines into one
// logical footer before matching. Bounded so the rejoin window can never reach
// past the wrapped footer into the menu body above it.
const FOOTER_MAX_WRAP_LINES = 3;

// The AskUserQuestion menu's footer. All three control segments required, in
// order, against the rejoined footer (NOT a loose substring). A working agent
// can legitimately STREAM the words "enter to select" in its own prose, but
// reproducing the whole fixed control string verbatim —
//   "Enter to select · Tab/Arrow keys to navigate · Esc to cancel"
// — is practically impossible. `.*` between segments tolerates separator/glyph
// drift across CLI versions (v2.1.161 wrote "↑/↓ to navigate", v2.1.276 writes
// "Tab/Arrow keys to navigate"). Case-insensitive only as a cheap hedge; the
// structure is what carries the weight.
const QUESTION_FOOTER_RE =
  /Enter to select\b.*\bto navigate\b.*\bEsc to cancel\b/i;

// Claude's *rewind* menu (opened by Esc-Esc at the idle prompt). It does NOT
// share the question footer — verified against CLI v2.1.161 it renders
// "Enter to continue · Esc to cancel" plus a "Restore the code…" header. Same
// ordered anchoring so streamed prose containing "enter to continue" cannot
// trip it. We detect it so escapeUntilPromptCleared() can treat it as a menu to
// dismiss rather than mistaking it for the idle prompt (which would strand it).
const REWIND_FOOTER_RE = /Enter to continue\b.*\bEsc to cancel\b/i;

// The CLI's composer — the input box it draws at the foot of the pane:
//
//   ───────────────────────────────────
//   ❯ …
//   ───────────────────────────────────
//     ⏵⏵ auto mode on · esc to interrupt
//
// THIS is the discriminator. The composer is rendered whenever no modal menu is
// open — idle, and mid-stream too, since you can type while the agent works —
// and a menu REPLACES it for as long as it is up. So a footer with a composer
// anywhere below it belongs to a menu that is already gone, and a footer with
// no composer below it belongs to one still on screen.
//
// It replaces an earlier rule that required the footer to be the bottom-most
// content line, over an allowlist of the chrome the CLI draws beneath a menu
// (blank rows, the spinner status line, "⎿ Tip:" hints). That allowlist was a
// closed guess at an open set, and it silently went stale the moment the CLI
// grew one more bottom notice: a peer "› Message from @… (ctrl+o to expand)"
// banner below an open menu made every question on that pane read as idle, so
// no answer form ever appeared and "Answer here" pressed no Escape. Crossing
// unknown lines is the safe direction — the composer is one fixed thing, and
// anything else below the footer is by definition not the composer.
const COMPOSER_RE = /^\s*(?:❯|[─━]{8,})/u;

export type PaneMenu = "question" | "rewind" | "idle";

/**
 * Which interactive menu (if any) is on screen in this pane capture.
 *
 * Walks UP from the bottom to the nearest footer terminator. Crossing a
 * composer line on the way means the footer is scrollback from a menu that has
 * already been answered, so the pane is idle.
 */
export function classifyPaneText(paneText: string): PaneMenu {
  const footer = liveMenuFooter(paneText);
  if (footer == null) return "idle";
  if (QUESTION_FOOTER_RE.test(footer)) return "question";
  if (REWIND_FOOTER_RE.test(footer)) return "rewind";
  return "idle";
}

/** The open menu's footer as one logical line, or null if no menu is open. */
function liveMenuFooter(paneText: string): string | null {
  const lines = paneText.split("\n");
  let end = lines.length - 1;
  while (end >= 0 && !FOOTER_TERMINATOR_RE.test(lines[end]!)) {
    if (COMPOSER_RE.test(lines[end]!)) return null;
    end--;
  }
  if (end < 0) return null;
  const start = Math.max(0, end + 1 - FOOTER_MAX_WRAP_LINES);
  return lines
    .slice(start, end + 1)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
