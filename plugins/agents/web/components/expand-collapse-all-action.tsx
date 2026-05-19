import { useCallback } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useSubtreeExpandAll } from "@plugins/primitives/plugins/tree/web";
import { ExpandAllButton } from "@plugins/primitives/plugins/collapsible/web";
import { agentsResource } from "../../shared/resources";
import { patchAgent } from "./agents-list";

export function ExpandCollapseAllAction({
  agentId,
  hasChildren,
}: {
  agentId: string;
  hasChildren: boolean;
}) {
  const result = useResource(agentsResource);
  const rows = result.pending ? [] : result.data;
  const patch = useCallback(
    (id: string, expanded: boolean) => patchAgent(id, { expanded }),
    [],
  );
  const { willCollapse, toggle } = useSubtreeExpandAll(rows, agentId, patch);

  if (!hasChildren || result.pending) return null;

  return (
    <ExpandAllButton allExpanded={!willCollapse} onToggle={toggle} />
  );
}
