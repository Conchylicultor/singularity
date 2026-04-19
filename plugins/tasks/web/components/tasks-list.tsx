import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MdChevronRight,
  MdAdd,
  MdCheckCircle,
  MdRadioButtonUnchecked,
  MdTimelapse,
  MdPauseCircle,
  MdCancel,
  MdIncompleteCircle,
  MdFilterAlt,
  MdFilterAltOff,
  MdDragIndicator,
  MdInput,
} from "react-icons/md";
import type { IconType } from "react-icons";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { generateKeyBetween } from "fractional-indexing";
import { useResource } from "@core";
import { tasksResource } from "../../shared/resources";
import { Tasks as TasksSlots } from "../slots";
import { Tasks as TasksCommands } from "../commands";
import { cn } from "@/lib/utils";

type TaskStatus =
  | "new"
  | "in_progress"
  | "need_action"
  | "attempted"
  | "done"
  | "held"
  | "dropped";

type Task = {
  id: string;
  parentId: string | null;
  title: string;
  rank: string;
  expanded: boolean;
  status: TaskStatus;
};

type DropZone = "before" | "after" | "child";

const STATUS_META: Record<
  TaskStatus,
  { icon: IconType; className: string; label: string }
> = {
  new: {
    icon: MdRadioButtonUnchecked,
    className: "text-muted-foreground/60",
    label: "New",
  },
  in_progress: {
    icon: MdTimelapse,
    className: "text-blue-600 dark:text-blue-400",
    label: "In progress",
  },
  need_action: {
    icon: MdInput,
    className: "text-orange-500 dark:text-orange-400",
    label: "Need action",
  },
  attempted: {
    icon: MdIncompleteCircle,
    className: "text-muted-foreground",
    label: "Attempted",
  },
  done: {
    icon: MdCheckCircle,
    className: "text-emerald-600 dark:text-emerald-400",
    label: "Done",
  },
  held: {
    icon: MdPauseCircle,
    className: "text-amber-600 dark:text-amber-400",
    label: "Held",
  },
  dropped: {
    icon: MdCancel,
    className: "text-muted-foreground/50",
    label: "Dropped",
  },
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

type TaskPatch = {
  title?: string;
  expanded?: boolean;
  parentId?: string | null;
  rank?: string;
};

async function patchTask(id: string, patch: TaskPatch) {
  await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

function isDescendant(
  rows: readonly Task[],
  ancestorId: string,
  candidateId: string,
): boolean {
  const parents = new Map(rows.map((r) => [r.id, r.parentId] as const));
  let cur: string | null = candidateId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === ancestorId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = parents.get(cur) ?? null;
  }
  return false;
}

function computeDrop(
  rows: readonly Task[],
  draggedId: string,
  zone: DropZone,
  targetId: string,
): { parentId: string | null; rank: string } | null {
  const target = rows.find((r) => r.id === targetId);
  if (!target) return null;

  if (zone === "child") {
    const children = rows
      .filter((r) => r.parentId === target.id && r.id !== draggedId)
      .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
    const last = children[children.length - 1];
    try {
      return {
        parentId: target.id,
        rank: generateKeyBetween(last?.rank ?? null, null),
      };
    } catch {
      return null;
    }
  }

  const siblings = rows
    .filter((r) => r.parentId === target.parentId && r.id !== draggedId)
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
  const idx = siblings.findIndex((s) => s.id === target.id);
  if (idx === -1) return null;

  try {
    if (zone === "before") {
      const prev = siblings[idx - 1];
      return {
        parentId: target.parentId,
        rank: generateKeyBetween(prev?.rank ?? null, target.rank),
      };
    }
    const next = siblings[idx + 1];
    return {
      parentId: target.parentId,
      rank: generateKeyBetween(target.rank, next?.rank ?? null),
    };
  } catch {
    return null;
  }
}

let pendingFocusAcrossMount: string | null = null;

export function TasksList({
  selectedId,
  rootTaskId,
  onSelect,
}: {
  selectedId?: string;
  rootTaskId?: string;
  onSelect?: (id: string) => void;
}) {
  const { data } = useResource(tasksResource);
  const rows = (data ?? []) as Task[];
  const actions = TasksSlots.TaskActions.useContributions();
  const [hideCompleted, setHideCompleted] = useState(true);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(() => {
    const id = pendingFocusAcrossMount;
    pendingFocusAcrossMount = null;
    return id;
  });

  const createTask = useCallback(
    async (parentId: string | null) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId }),
      });
      const task = (await res.json()) as Task;
      pendingFocusAcrossMount = task.id;
      if (onSelect) {
        onSelect(task.id);
      } else {
        TasksCommands.OpenTask({ id: task.id });
      }
    },
    [onSelect],
  );

  const toggle = useCallback(
    (id: string) => {
      const target = rows.find((r) => r.id === id);
      if (!target) return;
      void patchTask(id, { expanded: !target.expanded });
    },
    [rows],
  );

  const scoped = rootTaskId ? filterSubtree(rows, rootTaskId) : rows;
  const tree = buildTree(scoped);
  const visibleTree = hideCompleted ? hideCompletedSubtrees(tree) : tree;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTitle = useMemo(
    () => (activeId ? rows.find((r) => r.id === activeId)?.title ?? null : null),
    [activeId, rows],
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.data.current?.id as string | undefined;
    setActiveId(id ?? null);
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;
      const draggedId = active.data.current?.id as string | undefined;
      const zone = over.data.current?.zone as DropZone | undefined;
      const targetId = over.data.current?.targetId as string | undefined;
      if (!draggedId || !zone || !targetId) return;
      if (draggedId === targetId) return;
      if (isDescendant(rows, draggedId, targetId)) return;
      const dest = computeDrop(rows, draggedId, zone, targetId);
      if (!dest) return;
      const current = rows.find((r) => r.id === draggedId);
      if (
        current &&
        current.parentId === dest.parentId &&
        current.rank === dest.rank
      ) {
        return;
      }
      void patchTask(draggedId, dest);
    },
    [rows],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex flex-col gap-0.5">
        <div className="mb-1 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setHideCompleted((v) => !v)}
            aria-pressed={hideCompleted}
            title={hideCompleted ? "Show completed" : "Hide completed"}
            className={cn(
              "hover:bg-accent flex w-fit items-center gap-1 rounded px-2 py-1 text-xs",
              hideCompleted ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {hideCompleted ? (
              <MdFilterAlt className="size-4" />
            ) : (
              <MdFilterAltOff className="size-4" />
            )}
            {hideCompleted ? "Completed hidden" : "Hide completed"}
          </button>
        </div>
        {visibleTree.map((node) => (
          <TaskNode
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedId}
            onToggle={toggle}
            onAdd={createTask}
            onSelect={onSelect}
            actions={actions}
            pendingFocusId={pendingFocusId}
            clearPendingFocus={() => setPendingFocusId(null)}
            activeId={activeId}
          />
        ))}
        {!rootTaskId && (
          <button
            type="button"
            onClick={() => createTask(null)}
            className="text-muted-foreground hover:bg-accent hover:text-foreground mt-1 flex w-fit items-center gap-1 rounded px-2 py-1 text-sm"
          >
            <MdAdd className="size-4" />
            Add
          </button>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTitle !== null ? (
          <div className="bg-background/90 border-accent rounded border px-2 py-1 text-sm shadow">
            {activeTitle || "Untitled"}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function isFullyCompleted(node: TreeNode): boolean {
  const terminal = node.status === "done" || node.status === "dropped";
  return terminal && node.children.every(isFullyCompleted);
}

function hideCompletedSubtrees(tree: TreeNode[]): TreeNode[] {
  return tree
    .filter((n) => !isFullyCompleted(n))
    .map((n) => ({ ...n, children: hideCompletedSubtrees(n.children) }));
}

function filterSubtree(rows: readonly Task[], rootId: string): Task[] {
  const keep = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows) {
      if (r.parentId && keep.has(r.parentId) && !keep.has(r.id)) {
        keep.add(r.id);
        grew = true;
      }
    }
  }
  return rows.filter((r) => keep.has(r.id));
}

type ActionContribution = {
  id: string;
  component: React.ComponentType<{ taskId: string; hasChildren: boolean }>;
};

function TaskNode({
  node,
  depth,
  selectedId,
  onToggle,
  onAdd,
  onSelect,
  actions,
  pendingFocusId,
  clearPendingFocus,
  activeId,
}: {
  node: TreeNode;
  depth: number;
  selectedId?: string;
  onToggle: (id: string) => void;
  onAdd: (parentId: string | null) => void;
  onSelect?: (id: string) => void;
  actions: readonly ActionContribution[];
  pendingFocusId: string | null;
  clearPendingFocus: () => void;
  activeId: string | null;
}) {
  const isOpen = node.expanded;
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;
  const isDragging = activeId === node.id;

  const dragData = { id: node.id, parentId: node.parentId, rank: node.rank };
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({ id: `drag:${node.id}`, data: dragData });
  const { isOver: isOverBefore, setNodeRef: setBeforeRef } = useDroppable({
    id: `before:${node.id}`,
    data: { zone: "before" as const, targetId: node.id },
  });
  const { isOver: isOverAfter, setNodeRef: setAfterRef } = useDroppable({
    id: `after:${node.id}`,
    data: { zone: "after" as const, targetId: node.id },
  });
  const { isOver: isOverChild, setNodeRef: setChildRef } = useDroppable({
    id: `child:${node.id}`,
    data: { zone: "child" as const, targetId: node.id },
  });

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
      <div className="group/row relative">
        <button
          type="button"
          ref={setDragRef}
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
          className={cn(
            "absolute top-1/2 z-10 flex size-5 -translate-y-1/2 cursor-grab items-center justify-center rounded",
            "text-muted-foreground hover:bg-background/60 active:cursor-grabbing",
            "opacity-0 group-hover/row:opacity-60",
          )}
          style={{ left: depth * 16 - 16 }}
        >
          <MdDragIndicator className="size-4" />
        </button>
        <div
          ref={setChildRef}
          className={cn(
            "group flex items-center gap-1 rounded px-1 py-1 text-sm",
            "hover:bg-accent",
            isSelected && "bg-accent",
            isDragging && "opacity-40",
            isOverChild && "bg-accent ring-primary/40 ring-1",
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
          <StatusIcon status={node.status} />
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => onChange(e.target.value)}
            onMouseDown={() => {
              if (!isSelected) {
                pendingFocusAcrossMount = node.id;
                if (onSelect) {
                  onSelect(node.id);
                } else {
                  TasksCommands.OpenTask({ id: node.id });
                }
              }
            }}
            onBlur={onBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                inputRef.current?.blur();
              }
            }}
            className={cn(
              "flex-1 truncate bg-transparent outline-none",
              node.status === "dropped" &&
                "text-muted-foreground/70 line-through italic",
              node.status === "done" && "text-muted-foreground",
            )}
          />
          {actions.length > 0 && (
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
              {actions.map((a) => (
                <a.component
                  key={a.id}
                  taskId={node.id}
                  hasChildren={hasChildren}
                />
              ))}
            </div>
          )}
        </div>
        <div
          ref={setBeforeRef}
          className="pointer-events-none absolute inset-x-0 top-0 h-[6px]"
        >
          {isOverBefore && (
            <div className="bg-primary absolute inset-x-1 top-0 h-[2px] rounded-full" />
          )}
        </div>
        <div
          ref={setAfterRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[6px]"
        >
          {isOverAfter && (
            <div className="bg-primary absolute inset-x-1 bottom-0 h-[2px] rounded-full" />
          )}
        </div>
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
              onSelect={onSelect}
              actions={actions}
              pendingFocusId={pendingFocusId}
              clearPendingFocus={clearPendingFocus}
              activeId={activeId}
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

function StatusIcon({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      className="flex size-5 shrink-0 items-center justify-center"
    >
      <Icon className={cn("size-4", meta.className)} />
    </span>
  );
}
