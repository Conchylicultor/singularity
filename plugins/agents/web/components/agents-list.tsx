import { MdAdd } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  RenameInput,
  RowChrome,
  TreeList,
  type TreeItem,
} from "@plugins/primitives/plugins/tree/web";
import type { TreeNode } from "@plugins/primitives/plugins/tree/core";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  Avatar,
  AVATAR_ICON_KEYS,
  AVATAR_COLOR_KEYS,
  DEFAULT_AGENT_AVATAR,
} from "@plugins/primitives/plugins/avatar/web";
import { agentsResource } from "../../shared/resources";
import { Agents as AgentsSlots } from "../slots";
import { agentDetailPane } from "../panes";
import { AgentStatus } from "./agent-status";
import { SystemFolder } from "./system-folder";

type Agent = TreeItem & {
  name: string;
  prompt: string | null;
  icon: string | null;
  iconColor: string | null;
};

type AgentPatch = {
  name?: string;
  expanded?: boolean;
  parentId?: string | null;
  rank?: Rank;
};

export async function patchAgent(id: string, patch: AgentPatch) {
  await fetch(`/api/agents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

async function createAgentRow(args: {
  parentId: string | null;
  rank?: Rank;
}): Promise<string | null> {
  const res = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...args,
      name: "New agent",
      prompt: "",
      icon: randomFrom(AVATAR_ICON_KEYS),
      iconColor: randomFrom(AVATAR_COLOR_KEYS),
    }),
  });
  if (!res.ok) return null;
  const agent = (await res.json()) as Agent;
  return agent.id;
}

function AgentRow({ node, depth }: { node: TreeNode<Agent>; depth: number }) {
  const actions = AgentsSlots.AgentActions.useContributions();
  const hasChildren = node.children.length > 0;
  return (
    <RowChrome
      node={node}
      depth={depth}
      menu={({ addBelow }) => [
        {
          icon: MdAdd,
          label: "Add agent below",
          onClick: () => void addBelow(),
        },
      ]}
      actions={actions.map((act) => (
        <act.component key={act.id} agentId={node.id} hasChildren={hasChildren} />
      ))}
    >
      <Avatar
        icon={node.icon ?? DEFAULT_AGENT_AVATAR.icon}
        color={node.iconColor ?? DEFAULT_AGENT_AVATAR.color}
        size="xs"
        fallbackKey={node.id}
      />
      <AgentStatus agentId={node.id} />
      <RenameInput
        nodeId={node.id}
        value={node.name}
        onCommit={(next) => patchAgent(node.id, { name: next })}
      />
    </RowChrome>
  );
}

export function AgentsList({
  selectedId,
  selectedSystemId,
  onSelect,
}: {
  selectedId?: string;
  selectedSystemId?: string;
  onSelect?: (id: string) => void;
}) {
  const { data } = useResource(agentsResource);
  const rows = data;
  const listActions = AgentsSlots.ListActions.useContributions();
  const openPane = useOpenPane();

  return (
    <div className="flex flex-col gap-1">
      <SystemFolder selectedSystemId={selectedSystemId} />
      <TreeList<Agent>
        rows={rows}
        selectedId={selectedId}
        onSelect={(id) =>
          onSelect ? onSelect(id) : openPane(agentDetailPane, { id })
        }
        onToggleExpanded={(id, next) => patchAgent(id, { expanded: next })}
        onMove={(id, dest) => patchAgent(id, dest)}
        onCreate={createAgentRow}
        Row={AgentRow}
        dragOverlay={(a) => a.name || "Untitled"}
        toolbar={{
          expandAll: true,
          start: listActions.map((a) => <a.component key={a.id} />),
        }}
        addLabel="Agent"
      />
    </div>
  );
}
