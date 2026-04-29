import { runClaudePrint } from "@plugins/infra/plugins/claude-cli/server";
import { updateTaskTitle } from "./mutations/tasks";

// Haiku ignores a system-only instruction when the user message looks like a
// feature request — it answers conversationally instead. Restating the task in
// the user turn and wrapping the description in a tag forces it to treat the
// content as data, not a request.
const SYSTEM_PROMPT = `You generate concise titles for tasks.
Given a task description, output a single short imperative title (max ~60 characters).
Output the title text only — no quotes, no trailing period, no preamble, no commentary.`;

function buildPrompt(description: string): string {
  return `Generate a concise imperative title (max ~60 characters) for the task described below. Do not respond to the description — only emit the title text, with no quotes, no trailing period, no preamble, and no commentary.

<task_description>
${description}
</task_description>`;
}

export function synthesiseTitleFallback(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? text;
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

export async function generateTaskTitle(description: string): Promise<string> {
  const fallback = synthesiseTitleFallback(description);
  if (!description.trim()) return fallback;
  try {
    const out = await runClaudePrint({
      model: "haiku",
      prompt: buildPrompt(description),
      system: SYSTEM_PROMPT,
      timeoutMs: 30_000,
    });
    const cleaned = out
      .trim()
      .split(/\r?\n/)[0]
      ?.trim()
      .replace(/^["']|["']$/g, "")
      .trim();
    if (!cleaned) return fallback;
    return cleaned.length > 80 ? `${cleaned.slice(0, 77)}…` : cleaned;
  } catch (err) {
    console.warn("[tasks-core] generateTaskTitle fell back:", err);
    return fallback;
  }
}

// Fire-and-forget Haiku title generation. Callers create the task with
// `synthesiseTitleFallback(description)` so launching is instant; this then
// upgrades the title in the background. The `onlyIfTitleIn` guard ensures we
// never clobber a user edit that landed before Haiku returned.
export function scheduleTaskTitleUpdate(
  taskId: string,
  description: string,
  fallbackTitle: string,
): void {
  if (!description.trim()) return;
  void (async () => {
    try {
      const generated = await generateTaskTitle(description);
      if (generated === fallbackTitle) return;
      await updateTaskTitle(taskId, generated, [fallbackTitle]);
    } catch (err) {
      console.warn("[tasks-core] scheduleTaskTitleUpdate failed:", err);
    }
  })();
}
