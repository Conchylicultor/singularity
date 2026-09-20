import { lastStepOfLines, type LastStep } from "../../core";

/**
 * How much of a sub-agent transcript's END we read to learn what it last did.
 *
 * The point of the bound: a sub-agent's transcript grows into the megabytes
 * (1.2 MB is ordinary), and the index re-reads on every append. Reading the last
 * 64 KB makes each change cost a constant, tiny read no matter how long the
 * sub-agent has been running — a whole-file parse is what the *pane* does, once,
 * when you open it.
 */
export const TAIL_WINDOW_BYTES = 64 * 1024;

/**
 * The most recent classifiable step in a transcript, from its last
 * `TAIL_WINDOW_BYTES`.
 *
 * This half only bounds the read and parses the window; which line the step is
 * taken FROM is `lastStepOfLines` in core, where the rules live — including the
 * one that matters most, that a trailing `tool_result` defers to the `tool_use`
 * it answers rather than quoting its payload.
 *
 * `null` = nothing in the window says anything yet (an empty file at birth), not
 * "it did nothing".
 */
export async function readLastStep(
  path: string,
  size: number,
): Promise<LastStep | null> {
  const start = Math.max(0, size - TAIL_WINDOW_BYTES);
  const text = await Bun.file(path).slice(start).text();
  const lines = text.split("\n");
  // A window that did not start at byte 0 begins mid-line; that fragment is not
  // parseable JSON and must not be mistaken for a line of its own.
  if (start > 0) lines.shift();

  const parsed: Record<string, unknown>[] = [];
  for (const raw of lines) {
    if (raw === "") continue;
    try {
      parsed.push(JSON.parse(raw) as Record<string, unknown>);
    } catch (err) {
      // A torn final line (Claude appended while we read) is expected; anything
      // else is a real failure.
      if (!(err instanceof SyntaxError)) throw err;
    }
  }
  return lastStepOfLines(parsed);
}
