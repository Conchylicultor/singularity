/**
 * Pure parsing of a tmux `capture-pane -e` dump into the Claude Code input-box
 * draft. No tmux / I/O here on purpose: this is the fiddly, correctness-critical
 * part (telling a real draft from the dim autosuggestion ghost) and it is
 * unit-tested in input-draft.test.ts against real captured escape sequences.
 * tmux-runtime.ts owns only the spawn and passes the captured text through here.
 */

const ANSI_SGR_RE = /\x1b\[[0-9;]*m/g;
export const stripAnsi = (s: string): string => s.replace(ANSI_SGR_RE, "");

const PROMPT_GLYPH = "❯";
const RULE_RE = /^─{10,}$/;
// When a turn is sent to a WORKING agent, the CLI queues it: the submitted text
// moves ABOVE the box into the queued-message list, and the now-empty input box
// is filled with the dim hint "Press up to edit queued messages" rather than
// left blank. That hint is NOT a live user draft — it is the box's resting state
// while a queued message is pending. We must read it as an empty box, otherwise
// pasteTurn's Phase-2 verification (which waits for the live draft to clear after
// Enter) would see a perpetually "non-empty" box and throw `draft did not clear`
// after SUBMIT_TIMEOUT_MS, even though the message was queued successfully.
// Matched loosely (no anchors) to tolerate leading glyphs / wording drift.
const INPUT_PLACEHOLDER_RE = /Press up to edit queued messages/i;

/**
 * Return only the NON-faint visible text of one escape-preserving captured line.
 *
 * This is the crux of telling a REAL draft from a ghost. Claude Code renders the
 * autosuggestion ghost prompt it pre-fills into an empty box — AND the
 * queued-message placeholder hint — with the terminal "faint" attribute
 * (`ESC[2m`…), while genuine user-typed text is normal intensity. A plain
 * `capture-pane` strips colour, so the grey ghost ("Implement it", "fix it…")
 * reads identically to a real draft — a false positive that would fire a
 * spurious C-c in send(). Keying on the faint attribute mirrors the TUI's own
 * visual encoding.
 *
 * We walk the SGR state machine (code 2 sets faint, 0/22 clear it) and drop
 * faint characters. An unterminated faint run is treated as faint-to-end-of-line
 * because a width-truncated ghost (`…`) never emits its closing reset. A typed
 * prefix with a dim suggested completion (bright "fix" + faint " the rest")
 * correctly yields just "fix". Non-`m` CSI sequences are consumed and ignored.
 */
export function nonFaintText(line: string): string {
  let faint = false;
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (line[i] === "\x1b" && line[i + 1] === "[") {
      let j = i + 2;
      while (j < line.length && !/[A-Za-z]/.test(line[j]!)) j++;
      if (line[j] === "m") {
        const codes = line
          .slice(i + 2, j)
          .split(";")
          .filter((c) => c !== "")
          .map(Number);
        if (codes.length === 0) codes.push(0); // bare ESC[m === ESC[0m
        for (const c of codes) {
          if (c === 2) faint = true;
          else if (c === 0 || c === 22) faint = false;
        }
      }
      i = j + 1;
      continue;
    }
    if (!faint) out += line[i];
    i++;
  }
  return out;
}

/**
 * Extract the current draft text from an escape-preserving pane capture, or null
 * when the input box can't be located (unrecognized render). The box is the `❯`
 * prompt line plus any continuation lines, up to the next full-width `─` rule
 * below it. We anchor on the bottom-most `❯` (always the live input prompt;
 * transcript rules/glyphs sit above it), so an empty box returns "" and a box
 * holding a real draft returns non-empty.
 *
 * Box boundaries are detected on the colour-stripped text; only the draft
 * content runs through nonFaintText, which drops the dim autosuggestion ghost
 * and the queued-message placeholder — both of which Claude Code renders faint.
 * INPUT_PLACEHOLDER_RE stays as a backstop for any placeholder wording not
 * rendered faint.
 *
 * Input must come from `tmux capture-pane -e` (escapes preserved) — a plain
 * capture would make every ghost read as a real draft.
 */
export function parseInputDraft(captured: string): string | null {
  const lines = captured.split("\n");
  let promptIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (stripAnsi(lines[i]!).includes(PROMPT_GLYPH)) {
      promptIdx = i;
      break;
    }
  }
  if (promptIdx === -1) return null;
  let end = lines.length;
  for (let i = promptIdx + 1; i < lines.length; i++) {
    if (RULE_RE.test(stripAnsi(lines[i]!).trim())) {
      end = i;
      break;
    }
  }
  const draft = lines
    .slice(promptIdx, end)
    .map(nonFaintText)
    .join("\n")
    .split(PROMPT_GLYPH)
    .join("")
    .trim();
  return INPUT_PLACEHOLDER_RE.test(draft) ? "" : draft;
}
