import { useCallback, useEffect, useRef, useState } from "react";
import {
  MdAdd,
  MdChevronRight,
  MdCreateNewFolder,
  MdFolder,
  MdSmartToy,
} from "react-icons/md";
import { useResource } from "@core";
import { agentsResource } from "../../shared/resources";
import { Agents as AgentsCommands } from "../commands";
import { Agents as AgentsSlots } from "../slots";
import { cn } from "@/lib/utils";

type Agent = {
  id: string;
  parentId: string | null;
  name: string;
  prompt: string | null;
  rank: string;
  expanded: boolean;
  isFolder: boolean;
};

type TreeNode = Agent & { children: TreeNode[] };

function buildTree(rows: readonly Agent[]): TreeNode[] {
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

async function patchAgent(
  id: string,
  patch: { name?: string; expanded?: boolean },
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
  const rows = (data ?? []) as Agent[];
  const actions = AgentsSlots.AgentActions.useContributions();
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(() => {
    const id = pendingFocusAcrossMount;
    pendingFocusAcrossMount = null;
    return id;
  });

  const create = useCallback(
    async (parentId: string | null, kind: "agent" | "folder") => {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId,
          name: kind === "folder" ? "New folder" : "New agent",
          prompt: kind === "folder" ? null : "",
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

  const tree = buildTree(rows);

  return (
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
        />
      ))}
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => create(null, "agent")}
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex w-fit items-center gap-1 rounded px-2 py-1 text-sm"
        >
          <MdAdd className="size-4" />
          Agent
        </button>
        <button
          type="button"
          onClick={() => create(null, "folder")}
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex w-fit items-center gap-1 rounded px-2 py-1 text-sm"
        >
          <MdCreateNewFolder className="size-4" />
          Folder
        </button>
      </div>
    </div>
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
}: {
  node: TreeNode;
  depth: number;
  selectedId?: string;
  onToggle: (id: string) => void;
  onAdd: (parentId: string | null, kind: "agent" | "folder") => void;
  onSelect?: (id: string) => void;
  actions: readonly ActionContribution[];
  pendingFocusId: string | null;
  clearPendingFocus: () => void;
}) {
  const isOpen = node.expanded;
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

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
          <TypeIcon isFolder={node.isFolder} />
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
            />
          ))}
          {node.isFolder && (
            <div
              className="flex items-center gap-2"
              style={{ paddingLeft: (depth + 1) * 16 + 4 }}
            >
              <button
                type="button"
                onClick={() => onAdd(node.id, "agent")}
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1 rounded px-2 py-1 text-sm"
              >
                <MdAdd className="size-4" />
                Agent
              </button>
              <button
                type="button"
                onClick={() => onAdd(node.id, "folder")}
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1 rounded px-2 py-1 text-sm"
              >
                <MdCreateNewFolder className="size-4" />
                Folder
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TypeIcon({ isFolder }: { isFolder: boolean }) {
  const Icon = isFolder ? MdFolder : MdSmartToy;
  return (
    <span className="flex size-5 shrink-0 items-center justify-center">
      <Icon
        className={cn(
          "size-4",
          isFolder ? "text-amber-600 dark:text-amber-400" : "text-primary",
        )}
      />
    </span>
  );
}
