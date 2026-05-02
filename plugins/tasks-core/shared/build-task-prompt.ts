// Single source of truth for the prompt shape used to launch a task — both the
// task-detail Launch buttons and the auto-start job route through this so the
// two paths cannot drift (description preserved when present; title alone
// otherwise).
export function buildTaskPrompt(
  task: { title?: string | null; description?: string | null },
): string {
  const title = (task.title ?? "").trim() || "Untitled";
  const desc = (task.description ?? "").trim();
  if (!desc) return title;
  // When the description already starts with the title (improve-form tasks store
  // the full user text in the description, and the title is derived from its first
  // line), prepending the title again would duplicate that first line.
  if (desc.startsWith(title)) return desc;
  return `${title}\n\n${desc}`;
}
