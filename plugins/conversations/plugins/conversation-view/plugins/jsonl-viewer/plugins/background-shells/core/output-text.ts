/**
 * Terminal escape sequences: CSI (`ESC [ … final`, colours and cursor moves),
 * OSC (`ESC ] … BEL` or `ESC ] … ESC \`, titles and hyperlinks), and the
 * remaining two-byte `ESC <char>` forms.
 */
const ANSI_PATTERN =
  /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

/** `text` with its terminal escape sequences removed. v1 draws no colour. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

/**
 * The line a shell most recently printed, for a one-line summary of what it is
 * doing now.
 *
 * Splits on `\r` as well as `\n`: a progress bar redraws its line with a bare
 * carriage return, so the latest FRAME is the last `\r`-separated piece, not
 * the whole accumulated line. Blank pieces (a trailing newline, a cleared line)
 * are skipped. `null` = nothing printed yet, which a surface says as "no output
 * yet" rather than showing an empty string.
 */
export function lastOutputLine(tail: string): string | null {
  const pieces = stripAnsi(tail).split(/[\r\n]/);
  for (let i = pieces.length - 1; i >= 0; i--) {
    const line = pieces[i]!.trimEnd();
    if (line.trim() !== "") return line;
  }
  return null;
}

/**
 * `tail` as a terminal would leave it on screen, for a plain `<pre>`: escape
 * sequences removed, and each line reduced to its LAST carriage-return frame —
 * a progress bar that redrew itself a hundred times shows its final state once,
 * rather than a hundred frames run together (a `<pre>` renders `\r` as a space).
 */
export function terminalText(tail: string): string {
  return stripAnsi(tail)
    .split("\n")
    .map((line) => {
      const frames = line.split("\r");
      for (let i = frames.length - 1; i >= 0; i--) {
        if (frames[i] !== "") return frames[i]!;
      }
      return "";
    })
    .join("\n");
}
