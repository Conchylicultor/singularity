// Single source of truth for the prompt shape used to launch a task — both the
// task-detail Launch buttons and the auto-start job route through this so the
// two paths cannot drift (description preserved when present; title alone
// otherwise).
export function buildTaskPrompt(
  task: { title?: string | null; description?: string | null; titleAuto?: boolean },
): string {
  const title = (task.title ?? "").trim() || "Untitled";
  const desc = (task.description ?? "").trim();
  if (!desc) return title;
  // An auto-generated title (Haiku/fallback summary of the description) carries
  // no information the description lacks — prepending it just duplicates content
  // the agent already has. Launch with the description alone.
  if (task.titleAuto) return desc;
  // Human-authored title: keep both, since the title may carry intent absent
  // from the description. Still dedupe when the description already begins with
  // the title (and handle the synthesiseTitleFallback "…" truncation case).
  if (desc.startsWith(title)) return desc;
  if (title.endsWith("…") && desc.startsWith(title.slice(0, -1))) return desc;
  return `${title}\n\n${desc}`;
}
