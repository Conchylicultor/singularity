import { useResource } from "@core";
import { TreeList } from "@plugins/tree/web";
import { agentsResource } from "../../shared/resources";
import { Agents as AgentsCommands } from "../commands";
import { Agents as AgentsSlots } from "../slots";
import { AgentStatus } from "./agent-status";

type Agent = {
  id: string;
  parentId: string | null;
  name: string;
  prompt: string | null;
  rank: string;
  expanded: boolean;
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

  return (
    <TreeList<Agent>
      rows={rows}
      selectedId={selectedId}
      labelOf={(a) => a.name}
      onSelect={(id) =>
        onSelect ? onSelect(id) : AgentsCommands.OpenAgent({ id })
      }
      onRename={(id, next) => patchAgent(id, { name: next })}
      onToggleExpanded={(id, next) => patchAgent(id, { expanded: next })}
      onMove={(id, dest) => patchAgent(id, dest)}
      onCreate={createAgentRow}
      renderLeading={(a) => <AgentStatus agentId={a.id} />}
      renderActions={(a) =>
        actions.map((act) => <act.component key={act.id} agentId={a.id} />)
      }
      addLabel="Agent"
    />
  );
}
