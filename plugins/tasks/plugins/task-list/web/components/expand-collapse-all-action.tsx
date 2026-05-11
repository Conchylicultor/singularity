import { MdUnfoldLess, MdUnfoldMore } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { tasksResource } from "@plugins/tasks/shared";
import { patchTask } from "@plugins/tasks/web";
import { cn } from "@/lib/utils";

type TaskRow = { id: string; parentId: string | null; expanded: boolean };

function subtreeWithChildren(
  rows: readonly TaskRow[],
  rootId: string,
): TaskRow[] {
  const byParent = new Map<string, TaskRow[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    const arr = byParent.get(r.parentId) ?? [];
    arr.push(r);
    byParent.set(r.parentId, arr);
  }
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const result: TaskRow[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    const kids = byParent.get(id) ?? [];
    if (kids.length > 0) {
      const node = byId.get(id);
      if (node) result.push(node);
    }
    for (const k of kids) stack.push(k.id);
  }
  return result;
}

export function ExpandCollapseAllAction({
  taskId,
  hasChildren,
}: {
  taskId: string;
  hasChildren: boolean;
}) {
  const { data: rows } = useResource(tasksResource);
  if (!hasChildren) return null;

  const nodes = subtreeWithChildren(rows, taskId);
  const willCollapse = nodes.every((n) => n.expanded);
  const next = !willCollapse;

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await Promise.all(
      nodes
        .filter((n) => n.expanded !== next)
        .map((n) => patchTask(n.id, { expanded: next })),
    );
  };

  const Icon = willCollapse ? MdUnfoldLess : MdUnfoldMore;
  const title = willCollapse ? "Collapse all" : "Expand all";

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "hover:bg-background/60 flex size-6 shrink-0 items-center justify-center rounded",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
