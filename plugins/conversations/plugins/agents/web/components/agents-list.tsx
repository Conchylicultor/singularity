import { MdAdd, MdDelete } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  RenameInput,
  RowChrome,
  TreeList,
  type TreeItem,
} from "@plugins/primitives/plugins/tree/web";
import { buildTree, type TreeNode } from "@plugins/primitives/plugins/tree/core";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  Avatar,
  AVATAR_COLOR_KEYS,
  DEFAULT_AGENT_AVATAR,
} from "@plugins/primitives/plugins/avatar/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import {
  MultiSelectProvider,
  SelectionBar,
  SelectionCheckbox,
  useMultiSelect,
} from "@plugins/primitives/plugins/multi-select/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  createAgent,
  deleteAgent,
  updateAgent,
} from "@plugins/conversations/plugins/agents/core";
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
  iconSvgNodes: string | null;
};

type AgentPatch = {
  name?: string;
  expanded?: boolean;
  parentId?: string | null;
  rank?: Rank;
};

export async function patchAgent(id: string, patch: AgentPatch) {
  await fetchEndpoint(updateAgent, { id }, { body: patch });
}

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
  try {
    const agent = await fetchEndpoint(createAgent, {}, {
      body: {
        ...args,
        name: "New agent",
        prompt: "",
        iconColor: randomFrom(AVATAR_COLOR_KEYS),
      },
    });
    return agent.id;
  } catch (err) {
    throw err;
  }
}

function deriveVisibleOrder(rows: readonly Agent[]): string[] {
  const tree = buildTree(rows);
  const ids: string[] = [];
  function walk(nodes: TreeNode<Agent>[]) {
    for (const n of nodes) {
      ids.push(n.id);
      if (n.expanded) walk(n.children);
    }
  }
  walk(tree);
  return ids;
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
      className="inline-flex items-center gap-1 text-destructive hover:text-destructive/80"
    >
      <MdDelete className="size-3.5" />
      Delete
    </button>
  );
}

function AgentRow({ node, depth }: { node: TreeNode<Agent>; depth: number }) {
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
      actions={
        <AgentsSlots.AgentActions.Render>
          {(act) => <act.component agentId={node.id} hasChildren={hasChildren} />}
        </AgentsSlots.AgentActions.Render>
      }
    >
      <SelectionCheckbox id={node.id} />
      <Avatar
        icon={node.icon ?? DEFAULT_AGENT_AVATAR.icon}
        color={node.iconColor ?? DEFAULT_AGENT_AVATAR.color}
        svgNodes={parseSvgNodes(node.iconSvgNodes) ?? DEFAULT_AGENT_AVATAR.svgNodes}
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
  const result = useResource(agentsResource);
  const openPane = useOpenPane();

  if (result.pending) return <Loading variant="rows" />;

  const rows = result.data;
  const orderedIds = deriveVisibleOrder(rows);

  return (
    <MultiSelectProvider orderedIds={orderedIds}>
      <div className="flex flex-col gap-1">
        <SelectionBar actions={<DeleteSelectedAction />} />
        <SystemFolder selectedSystemId={selectedSystemId} />
        <TreeList<Agent>
          rows={rows}
          selectedId={selectedId}
          onSelect={(id) =>
            onSelect ? onSelect(id) : openPane(agentDetailPane, { id }, { mode: "push" })
          }
          onToggleExpanded={(id, next) => patchAgent(id, { expanded: next })}
          onMove={(id, dest) => patchAgent(id, dest)}
          onCreate={createAgentRow}
          Row={AgentRow}
          dragOverlay={(a) => a.name || "Untitled"}
          toolbar={{
            expandAll: true,
            search: { accessor: (a) => a.name },
            start: <AgentsSlots.ListActions.Render />,
          }}
          addLabel="Agent"
        />
      </div>
    </MultiSelectProvider>
  );
}
