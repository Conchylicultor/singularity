/**
 * The `stop_reason`s that close a turn. The harness writes an assistant message
 * in streamed pieces, each with `stop_reason: null` (or `tool_use` when it hands
 * off to a tool), and only the LAST piece of a turn that has ended carries one
 * of these. `stop_sequence` is also what a synthetic API-error reply ends on,
 * which ends the turn just the same.
 */
const TURN_END_REASONS = new Set<unknown>(["end_turn", "stop_sequence"]);

/**
 * Whether a sub-agent's newest turn has ENDED, read backwards from a window of
 * its own transcript.
 *
 * The only completion signal a sub-agent started by ANOTHER sub-agent has: its
 * launching call and any notification belong to the sub-agent that spawned it,
 * never to the conversation's transcript.
 *
 * **Positive evidence only.** `true` means the newest assistant/user line is an
 * assistant piece closing a turn. `false` means no such marker is there — which
 * is also how every transcript written by a Claude Code version that never
 * recorded `end_turn` reads (283 of 876 transcripts on this machine end on an
 * untagged piece, most of them from such versions). So `false` is "nothing
 * seen", never "still working".
 *
 * Only assistant and user lines decide: the harness appends attachment, system
 * and queue lines AFTER the final message, and those say nothing about the
 * turn. A user line newest — a tool result, or a message that woke an idle
 * teammate — means a turn is open again, so the reading follows the file and
 * nothing is latched.
 */
export function turnEndedOfLines(
  lines: readonly Record<string, unknown>[],
): boolean {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (line.type === "user") return false;
    if (line.type !== "assistant") continue;
    const message = line.message;
    if (typeof message !== "object" || message === null) return false;
    return TURN_END_REASONS.has(
      (message as Record<string, unknown>).stop_reason,
    );
  }
  return false;
}
