import { useCallback } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useSubtreeExpandAll } from "@plugins/primitives/plugins/tree/web";
import { ExpandAllButton } from "@plugins/primitives/plugins/collapsible/web";
import { agentsResource } from "../../shared/resources";
import type { Agent } from "../../shared/resources";
import { patchAgent } from "./patch-agent";

export function ExpandCollapseAllAction({
  agentId,
  hasChildren,
}: {
  agentId: string;
  hasChildren: boolean;
}) {
  const result = useResource(agentsResource);

  if (!hasChildren || result.pending) return null;

  return <ExpandCollapseAllActionInner agentId={agentId} rows={result.data} />;
}

function ExpandCollapseAllActionInner({
  agentId,
  rows,
}: {
  agentId: string;
  rows: Agent[];
}) {
  const patch = useCallback(
    (id: string, expanded: boolean) => patchAgent(id, { expanded }),
    [],
  );
  const { willCollapse, toggle } = useSubtreeExpandAll(rows, agentId, patch);

  return (
    <ExpandAllButton allExpanded={!willCollapse} onToggle={toggle} />
  );
}
