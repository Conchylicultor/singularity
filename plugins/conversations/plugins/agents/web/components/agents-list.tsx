import { MdAdd, MdDelete } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import type {
  TreeItem,
  RowChromeMenuHelpers,
  RowMenuItem,
} from "@plugins/primitives/plugins/tree/web";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  Avatar,
  AVATAR_COLOR_KEYS,
  DEFAULT_AGENT_AVATAR,
} from "@plugins/primitives/plugins/avatar/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import { useMultiSelect } from "@plugins/primitives/plugins/multi-select/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { DataView } from "@plugins/primitives/plugins/data-view/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { createAgent, deleteAgent } from "@plugins/conversations/plugins/agents/core";
import { agentsResource } from "../../shared/resources";
import { Agents as AgentsSlots } from "../slots";
import { agentDetailPane } from "../panes";
import { AgentStatus } from "./agent-status";
import { SystemFolder } from "./system-folder";
import { patchAgent } from "./patch-agent";

export { patchAgent } from "./patch-agent";

type Agent = TreeItem & {
  name: string;
  prompt: string | null;
  icon: string | null;
  iconColor: string | null;
  iconSvgNodes: string | null;
};

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function parseSvgNodes(raw: string | null | undefined): SvgNode[] | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as SvgNode[]; } catch (err) { if (!(err instanceof SyntaxError)) throw err; return null; }
}

async function createAgentRow(args: {
  parentId: string | null;
  rank?: Rank;
}): Promise<string | null> {
  const agent = await fetchEndpoint(createAgent, {}, {
    body: {
      ...args,
      name: "New agent",
      prompt: "",
      iconColor: randomFrom(AVATAR_COLOR_KEYS),
    },
  });
  return agent.id;
}

function DeleteSelectedAction() {
  const { selectedIds, clearAll } = useMultiSelect();
  const onClick = async () => {
    await Promise.all(
      [...selectedIds].map((id) => fetchEndpoint(deleteAgent, { id })),
    );
    clearAll();
  };
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className="inline-flex items-center gap-xs text-destructive hover:text-destructive/80"
    >
      <MdDelete className="size-3.5" />
      Delete
    </button>
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
  const result = useResource(agentsResource);
  const openPane = useOpenPane();

  if (result.pending) return <Loading variant="rows" />;

  const rows = result.data;

  return (
    <div className="flex flex-col gap-xs">
      <SystemFolder selectedSystemId={selectedSystemId} />
      <DataView<Agent>
        rows={rows}
        fields={[{ id: "name", label: "Name", primary: true, value: (a) => a.name }]}
        rowKey={(a) => a.id}
        views={["tree"]}
        storageKey="agents-list"
        selectedRowId={selectedId}
        onRowActivate={(a) =>
          onSelect ? onSelect(a.id) : openPane(agentDetailPane, { id: a.id }, { mode: "push" })
        }
        hierarchy={{
          getParentId: (a) => a.parentId,
          getRank: (a) => a.rank,
          isExpanded: (a) => a.expanded,
          onToggleExpanded: (id, next) => patchAgent(id, { expanded: next }),
          onMove: (id, dest) => patchAgent(id, dest),
          onRename: (id, next) => patchAgent(id, { name: next }),
          onCreate: createAgentRow,
        }}
        selection={{ bulkActions: <DeleteSelectedAction /> }}
        viewOptions={{
          tree: {
            leadingIcon: (a: Agent) => (
              <>
                <Avatar
                  icon={a.icon ?? DEFAULT_AGENT_AVATAR.icon}
                  color={a.iconColor ?? DEFAULT_AGENT_AVATAR.color}
                  svgNodes={parseSvgNodes(a.iconSvgNodes) ?? DEFAULT_AGENT_AVATAR.svgNodes}
                  size="xs"
                  fallbackKey={a.id}
                />
                <AgentStatus agentId={a.id} />
              </>
            ),
            renderItemActions: (a: Agent, { hasChildren }: { hasChildren: boolean }) => (
              <AgentsSlots.AgentActions.Render>
                {(act) => <act.component agentId={a.id} hasChildren={hasChildren} />}
              </AgentsSlots.AgentActions.Render>
            ),
            rowMenu: ({ addBelow }: RowChromeMenuHelpers): RowMenuItem[] => [
              {
                icon: MdAdd,
                label: "Add agent below",
                onClick: () => void addBelow(),
              },
            ],
            expandAll: true,
            addLabel: "Agent",
            toolbarStart: <AgentsSlots.ListActions.Render />,
            dragOverlay: (a: Agent) => a.name || "Untitled",
          },
        }}
      />
    </div>
  );
}
