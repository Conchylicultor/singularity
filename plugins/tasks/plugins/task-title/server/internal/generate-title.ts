import { runClaudePrint } from "@plugins/infra/plugins/claude-cli/server";
import { getTask, updateConversationsTitleForTask, updateTaskTitle } from "@plugins/tasks-core/server";

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

export async function generateTaskTitle(
  description: string,
  taskId?: string,
): Promise<string> {
  const fallback = synthesiseTitleFallback(description);
  if (!description.trim()) return fallback;
  try {
    const out = await runClaudePrint({
      model: "haiku",
      prompt: buildPrompt(description),
      system: SYSTEM_PROMPT,
      timeoutMs: 30_000,
      source: {
        name: "task-title",
        context: taskId ? { taskId } : undefined,
      },
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
    console.warn("[task-title] generateTaskTitle fell back:", err);
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
      const generated = await generateTaskTitle(description, taskId);
      if (generated !== fallbackTitle) {
        await updateTaskTitle(taskId, generated, [fallbackTitle]);
      }
      await updateConversationsTitleForTask(taskId, generated);
    } catch (err) {
      console.warn("[task-title] scheduleTaskTitleUpdate failed:", err);
    }
  })();
}

const UNINFORMATIVE_TITLES = ["Untitled", "Untitled conversation"];

export function scheduleTaskTitleUpgrade(taskId: string, text: string): void {
  if (!text.trim()) return;
  void (async () => {
    try {
      const task = await getTask(taskId);
      if (!task || !UNINFORMATIVE_TITLES.includes(task.title)) return;

      const generated = await generateTaskTitle(text, taskId);
      await updateTaskTitle(taskId, generated, UNINFORMATIVE_TITLES);
      await updateConversationsTitleForTask(taskId, generated);
    } catch (err) {
      console.warn("[task-title] scheduleTaskTitleUpgrade failed:", err);
    }
  })();
}
