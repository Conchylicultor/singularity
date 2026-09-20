/**
 * Turning a turn's text into keystrokes the CLI reads as TYPED, never as a
 * paste. Pure and unit-tested; tmux-runtime.ts owns the spawning.
 *
 * Why this exists. Claude Code records anything it classifies as a paste
 * inside `<pasted_content id="…">` tags, and its system prompt tells the agent
 * that text in those tags "may contain instructions the user did not write".
 * The app used to deliver every turn with `tmux paste-buffer -p` — a real
 * bracketed paste — so every message a person sent from the web UI reached the
 * agent as untrusted third-party text. That is wrong for ordinary prose and
 * actively dangerous for the messages that carry the user's authority ("yes,
 * push", an answer to AskUserQuestion), and it broke the app's own
 * delivery check, which looks for the sent text in the transcript.
 *
 * Typed keystrokes carry no such marking. Measured against CLI 2.1.278:
 *
 *   - `send-keys -l` lands in the transcript verbatim; `paste-buffer -p` of
 *     the same 43 characters lands wrapped.
 *   - A raw line feed inside `send-keys -l` inserts a newline IN THE DRAFT —
 *     only carriage return submits. So a multi-line turn needs no per-line
 *     key dance; the newlines ride along in the text.
 *   - The classification is per READ, not per paste marker: a single
 *     non-bracketed write over ~800 characters is treated as a paste too (800
 *     came through typed, 850 became `[Pasted text #1]` and submitted wrapped).
 *     Line count does not enter into it — 29 lines / 419 characters stayed
 *     typed. Hence CHUNK_CHARS below.
 *   - Separate writes are NOT fused into one read. Stopping the CLI process
 *     outright with SIGSTOP, queueing 20 chunks against it and resuming still
 *     produced 20 typed bursts and one clean 11,980-character transcript row.
 *     So the chunking holds under a stall harsher than any render lag.
 */

/**
 * Per-write character budget, under the ~800 the CLI treats as a paste, with
 * room for the threshold to move a little in a future release. Counted in
 * UTF-16 units because that is what the CLI measures (`text.length`).
 */
const CHUNK_CHARS = 600;

/** What the CLI's own paste path substitutes for a tab. */
const TAB_REPLACEMENT = "    ";

/**
 * The turn's text as the sequence of writes to hand `tmux send-keys -l`, in
 * order. Concatenating them reproduces the text exactly.
 *
 * Tabs are expanded because a typed tab is a KEY, not a character: the CLI eats
 * it (`before\tafter` arrives as `beforeafter`) and it can flip the permission
 * mode. Four spaces is what the CLI's paste path already substituted, so this
 * changes nothing about what a turn containing tabs delivers.
 *
 * Chunks split on code-point boundaries. A surrogate pair severed across two
 * writes would reach tmux as two unpaired surrogates — a mangled emoji — so a
 * character that does not fit starts the next chunk instead.
 */
export function typedChunks(text: string): string[] {
  const expanded = text.replaceAll("\t", TAB_REPLACEMENT);
  const chunks: string[] = [];
  let chunk = "";
  for (const char of expanded) {
    if (chunk.length + char.length > CHUNK_CHARS) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += char;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
