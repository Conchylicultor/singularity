import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MdAdd,
  MdChevronRight,
  MdDragIndicator,
} from "react-icons/md";
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
import { useResource } from "@core";
import {
  buildTree,
  computeDrop,
  isDescendant,
  type DropZone,
  type TreeNode,
} from "@plugins/tree/shared";
import { agentsResource } from "../../shared/resources";
import { Agents as AgentsCommands } from "../commands";
import { Agents as AgentsSlots } from "../slots";
import { cn } from "@/lib/utils";
import { AgentStatus } from "./agent-status";

type Agent = {
  id: string;
  parentId: string | null;
  name: string;
  prompt: string | null;
  rank: string;
  expanded: boolean;
};

async function patchAgent(
  id: string,
  patch: { name?: string; expanded?: boolean; parentId?: string | null; rank?: string },
) {
  await fetch(`/api/agents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

let pendingFocusAcrossMount: string | null = null;

export function AgentsList({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  const { data } = useResource(agentsResource);
  const rows = data ?? [];
  const actions = AgentsSlots.AgentActions.useContributions();
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(() => {
    const id = pendingFocusAcrossMount;
    pendingFocusAcrossMount = null;
    return id;
  });

  const create = useCallback(
    async (parentId: string | null) => {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId,
          name: "New agent",
          prompt: "",
        }),
      });
      if (!res.ok) return;
      const agent = (await res.json()) as Agent;
      pendingFocusAcrossMount = agent.id;
      if (onSelect) {
        onSelect(agent.id);
      } else {
        AgentsCommands.OpenAgent({ id: agent.id });
      }
    },
    [onSelect],
  );

  const toggle = useCallback(
    (id: string) => {
      const target = rows.find((r) => r.id === id);
      if (!target) return;
      void patchAgent(id, { expanded: !target.expanded });
    },
    [rows],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeName = useMemo(
    () => (activeId ? rows.find((r) => r.id === activeId)?.name ?? null : null),
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
      if (current && current.parentId === dest.parentId && current.rank === dest.rank) return;
      void patchAgent(draggedId, dest);
    },
    [rows],
  );

  const tree = buildTree(rows);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex flex-col gap-0.5">
        {tree.map((node) => (
          <AgentNode
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedId}
            onToggle={toggle}
            onAdd={create}
            onSelect={onSelect}
            actions={actions}
            pendingFocusId={pendingFocusId}
            clearPendingFocus={() => setPendingFocusId(null)}
            activeId={activeId}
          />
        ))}
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => create(null)}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex w-fit items-center gap-1 rounded px-2 py-1 text-sm"
          >
            <MdAdd className="size-4" />
            Agent
          </button>
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeName !== null ? (
          <div className="bg-background/90 border-accent rounded border px-2 py-1 text-sm shadow">
            {activeName || "Untitled"}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

type ActionContribution = {
  id: string;
  component: React.ComponentType<{ agentId: string }>;
};

function AgentNode({
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
  node: TreeNode<Agent>;
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

  const [name, setName] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) setName(node.name);
  }, [node.name]);

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
      if (next === node.name) return;
      void patchAgent(node.id, { name: next });
    },
    [node.id, node.name],
  );

  const onChange = (v: string) => {
    dirtyRef.current = true;
    setName(v);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => commit(v), 500);
  };

  const onBlur = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    commit(name);
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
          <AgentStatus agentId={node.id} />
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => onChange(e.target.value)}
            onMouseDown={() => {
              if (!isSelected) {
                pendingFocusAcrossMount = node.id;
                if (onSelect) {
                  onSelect(node.id);
                } else {
                  AgentsCommands.OpenAgent({ id: node.id });
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
            className="flex-1 truncate bg-transparent outline-none"
          />
          {actions.length > 0 && (
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
              {actions.map((a) => (
                <a.component key={a.id} agentId={node.id} />
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
            <AgentNode
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

