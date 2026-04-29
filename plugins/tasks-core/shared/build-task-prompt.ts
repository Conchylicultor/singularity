// Single source of truth for the prompt shape used to launch a task — both the
// task-detail Launch buttons and the auto-start job route through this so the
// two paths cannot drift (description preserved when present; title alone
// otherwise).
export function buildTaskPrompt(
  task: { title?: string | null; description?: string | null },
): string {
  const title = (task.title ?? "").trim() || "Untitled";
  const desc = (task.description ?? "").trim();
  return desc ? `${title}\n\n${desc}` : title;
}
