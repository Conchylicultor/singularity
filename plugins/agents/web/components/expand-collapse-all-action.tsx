import { MdUnfoldLess, MdUnfoldMore } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { cn } from "@/lib/utils";
import { agentsResource } from "../../shared/resources";
import { patchAgent } from "./agents-list";

type AgentRow = { id: string; parentId: string | null; expanded: boolean };

function subtreeWithChildren(
  rows: readonly AgentRow[],
  rootId: string,
): AgentRow[] {
  const byParent = new Map<string, AgentRow[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    const arr = byParent.get(r.parentId) ?? [];
    arr.push(r);
    byParent.set(r.parentId, arr);
  }
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const result: AgentRow[] = [];
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
  agentId,
  hasChildren,
}: {
  agentId: string;
  hasChildren: boolean;
}) {
  const { data } = useResource(agentsResource);
  const rows = data;
  if (!hasChildren) return null;

  const nodes = subtreeWithChildren(rows, agentId);
  const willCollapse = nodes.every((n) => n.expanded);
  const next = !willCollapse;

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await Promise.all(
      nodes
        .filter((n) => n.expanded !== next)
        .map((n) => patchAgent(n.id, { expanded: next })),
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
