import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import type { ConfigRegistration } from "@plugins/config_v2/web";
import type { ConfigTreeNode as ConfigTreeNodeData } from "../internal/prune-config-tree";
import { useConfigRowState } from "../internal/use-config-row-state";
import { ConfigRowBadge } from "./config-row-badge";

interface ConfigTreeNodeProps {
  item: ConfigTreeNodeData;
  depth: number;
  /** Collapsed group ids — a node is open unless its id is present. */
  collapsed: Set<string>;
  onToggle: (id: string, open: boolean) => void;
  selectedPath: string | undefined;
  onSelect: (reg: ConfigRegistration) => void;
}

/** Clickable settings row for a config-bearing node (label + state badge). */
function ConfigSelectableRow({
  registration,
  selected,
  onClick,
}: {
  registration: ConfigRegistration;
  selected: boolean;
  onClick: () => void;
}) {
  const { modifiedCount, hasConflict } = useConfigRowState(registration);
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-1 items-center justify-between rounded-md py-1.5 pr-2 text-left text-sm",
        "hover:bg-accent",
        selected && "bg-accent",
      )}
    >
      <span className="truncate">{registration.pluginName}</span>
      <ConfigRowBadge modifiedCount={modifiedCount} hasConflict={hasConflict} />
    </button>
  );
}

/**
 * Recursive nav row for the canonical plugin tree. A node may be selectable
 * (declares config), expandable (has config-bearing descendants), or both.
 */
export function ConfigTreeNode({
  item,
  depth,
  collapsed,
  onToggle,
  selectedPath,
  onSelect,
}: ConfigTreeNodeProps) {
  const { node, registration, children } = item;
  const hasChildren = children.length > 0;
  const isOpen = !collapsed.has(node.hierarchyId);
  const selected =
    registration != null &&
    selectedPath === encodeURIComponent(registration.storePath);

  const childRows = children.map((child) => (
    <ConfigTreeNode
      key={child.node.hierarchyId}
      item={child}
      depth={depth + 1}
      collapsed={collapsed}
      onToggle={onToggle}
      selectedPath={selectedPath}
      onSelect={onSelect}
    />
  ));

  // Pure group: no config of its own, only config-bearing descendants.
  if (hasChildren && !registration) {
    return (
      <Collapsible
        open={isOpen}
        onOpenChange={(open) => onToggle(node.hierarchyId, open)}
      >
        <CollapsibleTrigger
          className="flex w-full items-center gap-1 rounded-md py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
          style={{ paddingLeft: depth * 12 + 8 }}
        >
          <CollapsibleChevron className="size-3" />
          <span className="truncate">{node.name}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>{childRows}</CollapsibleContent>
      </Collapsible>
    );
  }

  // Combined: selectable row that also expands to its descendants.
  if (hasChildren && registration) {
    return (
      <Collapsible
        open={isOpen}
        onOpenChange={(open) => onToggle(node.hierarchyId, open)}
      >
        <div
          className="flex items-center gap-1"
          style={{ paddingLeft: depth * 12 + 8 }}
        >
          <CollapsibleTrigger className="w-auto shrink-0 rounded-md p-0.5 text-muted-foreground hover:bg-accent">
            <CollapsibleChevron className="size-3" />
          </CollapsibleTrigger>
          <ConfigSelectableRow
            registration={registration}
            selected={selected}
            onClick={() => onSelect(registration)}
          />
        </div>
        <CollapsibleContent>{childRows}</CollapsibleContent>
      </Collapsible>
    );
  }

  // Leaf: config-bearing node with no config-bearing descendants. The spacer
  // keeps the label aligned with rows that show a chevron.
  if (registration) {
    return (
      <div
        className="flex items-center gap-1"
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        <span className="size-3 shrink-0" />
        <ConfigSelectableRow
          registration={registration}
          selected={selected}
          onClick={() => onSelect(registration)}
        />
      </div>
    );
  }

  return null;
}
