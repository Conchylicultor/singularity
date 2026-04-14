import { useCallback, useEffect, useState } from "react";
import { MdChevronRight, MdAdd } from "react-icons/md";
import { ReconnectingEventSource } from "@core";
import { Tasks as TasksCommands } from "../commands";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  parentId: string | null;
  title: string;
};

type TreeNode = Task & { children: TreeNode[] };

function buildTree(rows: Task[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  rows.forEach((r) => byId.set(r.id, { ...r, children: [] }));
  const roots: TreeNode[] = [];
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export function TasksList({ selectedId }: { selectedId?: string }) {
  const [rows, setRows] = useState<Task[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch("/api/tasks");
    setRows(await res.json());
  }, []);

  useEffect(() => {
    void load();
    const es = new ReconnectingEventSource({
      url: "/api/tasks/stream",
      onMessage: () => {
        void load();
      },
    });
    return () => es.close();
  }, [load]);

  const createTask = useCallback(
    async (parentId: string | null) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId }),
      });
      const task = (await res.json()) as Task;
      setRows((prev) => [...prev, task]);
      if (parentId) {
        setExpanded((prev) => new Set(prev).add(parentId));
      }
      TasksCommands.OpenTask({ id: task.id });
    },
    [],
  );

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const tree = buildTree(rows);

  return (
    <div className="flex flex-col gap-0.5">
      {tree.map((node) => (
        <TaskNode
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          selectedId={selectedId}
          onToggle={toggle}
          onAdd={createTask}
        />
      ))}
      <button
        type="button"
        onClick={() => createTask(null)}
        className="text-muted-foreground hover:bg-accent hover:text-foreground mt-1 flex w-fit items-center gap-1 rounded px-2 py-1 text-sm"
      >
        <MdAdd className="size-4" />
        Add
      </button>
    </div>
  );
}

function TaskNode({
  node,
  depth,
  expanded,
  selectedId,
  onToggle,
  onAdd,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  selectedId?: string;
  onToggle: (id: string) => void;
  onAdd: (parentId: string | null) => void;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded px-1 py-1 text-sm",
          "hover:bg-accent",
          isSelected && "bg-accent",
        )}
        style={{ paddingLeft: depth * 16 + 4 }}
      >
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          aria-label={isOpen ? "Collapse" : "Expand"}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded",
            "hover:bg-background/60",
            hasChildren
              ? "opacity-40 group-hover:opacity-100"
              : "opacity-0 group-hover:opacity-60",
          )}
        >
          <MdChevronRight
            className={cn(
              "size-4 transition-transform",
              isOpen && "rotate-90",
            )}
          />
        </button>
        <button
          type="button"
          onClick={() => TasksCommands.OpenTask({ id: node.id })}
          className="flex-1 truncate text-left"
        >
          {node.title}
        </button>
      </div>
      {isOpen && (
        <div>
          {node.children.map((child) => (
            <TaskNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              onToggle={onToggle}
              onAdd={onAdd}
            />
          ))}
          <button
            type="button"
            onClick={() => onAdd(node.id)}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1 rounded px-2 py-1 text-sm"
            style={{ paddingLeft: (depth + 1) * 16 + 4 }}
          >
            <MdAdd className="size-4" />
            Add
          </button>
        </div>
      )}
    </div>
  );
}
