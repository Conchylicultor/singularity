/**
 * Single source of truth for interrupt-sentinel detection.
 * Used to recognize both interrupt tool-results (tool_call result.content)
 * and standalone stop messages from the Claude CLI.
 */

const INTERRUPT_SENTINELS = ["[Request interrupted by user"] as const;

const CASE_INSENSITIVE_SENTINELS = [
  "this query was stopped by the user",
] as const;

export function isInterruptContent(text: string): boolean {
  const trimmed = text.trim();
  for (const sentinel of INTERRUPT_SENTINELS) {
    if (trimmed.startsWith(sentinel)) return true;
  }
  const lower = trimmed.toLowerCase();
  for (const sentinel of CASE_INSENSITIVE_SENTINELS) {
    if (lower.startsWith(sentinel)) return true;
  }
  return false;
}
