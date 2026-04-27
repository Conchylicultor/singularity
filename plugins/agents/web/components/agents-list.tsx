import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  RenameInput,
  RowChrome,
  TreeList,
  type TreeItem,
} from "@plugins/tree/web";
import type { TreeNode } from "@plugins/tree/shared";
import { agentsResource } from "../../shared/resources";
import { Agents as AgentsSlots } from "../slots";
import { agentDetailPane } from "../panes";
import { AgentStatus } from "./agent-status";

type Agent = TreeItem & {
  name: string;
  prompt: string | null;
};

type AgentPatch = {
  name?: string;
  expanded?: boolean;
  parentId?: string | null;
  rank?: string;
};

async function patchAgent(id: string, patch: AgentPatch) {
  await fetch(`/api/agents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

async function createAgentRow(args: {
  parentId: string | null;
  rank?: string;
}): Promise<string | null> {
  const res = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...args, name: "New agent", prompt: "" }),
  });
  if (!res.ok) return null;
  const agent = (await res.json()) as Agent;
  return agent.id;
}

function AgentRow({ node, depth }: { node: TreeNode<Agent>; depth: number }) {
  const actions = AgentsSlots.AgentActions.useContributions();
  return (
    <RowChrome
      node={node}
      depth={depth}
      actions={actions.map((act) => (
        <act.component key={act.id} agentId={node.id} />
      ))}
    >
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
  onSelect,
}: {
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  const { data } = useResource(agentsResource);
  const rows = data ?? [];

  return (
    <TreeList<Agent>
      rows={rows}
      selectedId={selectedId}
      onSelect={(id) =>
        onSelect ? onSelect(id) : agentDetailPane.open({ id })
      }
      onToggleExpanded={(id, next) => patchAgent(id, { expanded: next })}
      onMove={(id, dest) => patchAgent(id, dest)}
      onCreate={createAgentRow}
      Row={AgentRow}
      dragOverlay={(a) => a.name || "Untitled"}
      addLabel="Agent"
    />
  );
}
