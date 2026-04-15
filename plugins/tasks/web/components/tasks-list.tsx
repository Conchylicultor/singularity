import { useCallback, useEffect, useRef, useState } from "react";
import { MdChevronRight, MdAdd } from "react-icons/md";
import { useResource } from "@core";
import { tasksResource } from "../../shared/resources";
import { Tasks as TasksSlots } from "../slots";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  parentId: string | null;
  title: string;
  expanded: boolean;
};

type TreeNode = Task & { children: TreeNode[] };

function buildTree(rows: readonly Task[]): TreeNode[] {
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

async function patchTask(id: string, patch: Partial<Pick<Task, "title" | "expanded">>) {
  await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function TasksList({ selectedId }: { selectedId?: string }) {
  const { data } = useResource(tasksResource);
  const rows = (data ?? []) as Task[];
  const actions = TasksSlots.TaskActions.useContributions();
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  const createTask = useCallback(
    async (parentId: string | null) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId }),
      });
      const task = (await res.json()) as Task;
      if (parentId) void patchTask(parentId, { expanded: true });
      setPendingFocusId(task.id);
    },
    [],
  );

  const toggle = useCallback(
    (id: string) => {
      const target = rows.find((r) => r.id === id);
      if (!target) return;
      void patchTask(id, { expanded: !target.expanded });
    },
    [rows],
  );

  const tree = buildTree(rows);

  return (
    <div className="flex flex-col gap-0.5">
      {tree.map((node) => (
        <TaskNode
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onToggle={toggle}
          onAdd={createTask}
          actions={actions}
          pendingFocusId={pendingFocusId}
          clearPendingFocus={() => setPendingFocusId(null)}
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

type ActionContribution = {
  id: string;
  component: React.ComponentType<{ taskId: string }>;
};

function TaskNode({
  node,
  depth,
  selectedId,
  onToggle,
  onAdd,
  actions,
  pendingFocusId,
  clearPendingFocus,
}: {
  node: TreeNode;
  depth: number;
  selectedId?: string;
  onToggle: (id: string) => void;
  onAdd: (parentId: string | null) => void;
  actions: readonly ActionContribution[];
  pendingFocusId: string | null;
  clearPendingFocus: () => void;
}) {
  const isOpen = node.expanded;
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  const [title, setTitle] = useState(node.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) setTitle(node.title);
  }, [node.title]);

  useEffect(() => {
    if (pendingFocusId === node.id && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      clearPendingFocus();
    }
  }, [pendingFocusId, node.id, clearPendingFocus]);

  const commit = useCallback(
    (value: string) => {
      dirtyRef.current = false;
      const next = value.trim() || "Untitled";
      if (next === node.title) return;
      void patchTask(node.id, { title: next });
    },
    [node.id, node.title],
  );

  const onChange = (v: string) => {
    dirtyRef.current = true;
    setTitle(v);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => commit(v), 500);
  };

  const onBlur = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    commit(title);
  };

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
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              inputRef.current?.blur();
            }
          }}
          className="flex-1 truncate bg-transparent outline-none"
        />
        {actions.length > 0 && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
            {actions.map((a) => (
              <a.component key={a.id} taskId={node.id} />
            ))}
          </div>
        )}
      </div>
      {isOpen && (
        <div>
          {node.children.map((child) => (
            <TaskNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onToggle={onToggle}
              onAdd={onAdd}
              actions={actions}
              pendingFocusId={pendingFocusId}
              clearPendingFocus={clearPendingFocus}
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
