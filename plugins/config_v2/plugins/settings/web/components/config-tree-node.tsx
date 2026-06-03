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

/** Clickable settings row for a config (label + state badge). */
function ConfigSelectableRow({
  registration,
  label,
  selected,
  onClick,
}: {
  registration: ConfigRegistration;
  label: string;
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
      <span className="truncate">{label}</span>
      <ConfigRowBadge modifiedCount={modifiedCount} hasConflict={hasConflict} />
    </button>
  );
}

/** Indented config row with a chevron-aligned spacer (no expander of its own). */
function ConfigLeafRow({
  registration,
  label,
  depth,
  selectedPath,
  onSelect,
}: {
  registration: ConfigRegistration;
  label: string;
  depth: number;
  selectedPath: string | undefined;
  onSelect: (reg: ConfigRegistration) => void;
}) {
  const selected = selectedPath === encodeURIComponent(registration.storePath);
  return (
    <div
      className="flex items-center gap-1"
      style={{ paddingLeft: depth * 12 + 8 }}
    >
      <span className="size-3 shrink-0" />
      <ConfigSelectableRow
        registration={registration}
        label={label}
        selected={selected}
        onClick={() => onSelect(registration)}
      />
    </div>
  );
}

/**
 * Recursive nav row for the canonical plugin tree. A node may carry zero, one,
 * or many config registrations and may have config-bearing descendant plugins:
 *
 * - 0 configs + children → pure group (expandable).
 * - 1 config, no children → leaf; the plugin name itself opens the config.
 * - 1 config + children → selectable plugin row that also expands to descendants.
 * - >1 configs → expandable group; each config is a child row, alongside any
 *   descendant plugins. The plugin name is not directly selectable.
 */
export function ConfigTreeNode({
  item,
  depth,
  collapsed,
  onToggle,
  selectedPath,
  onSelect,
}: ConfigTreeNodeProps) {
  const { node, registrations, children } = item;
  const hasChildren = children.length > 0;
  const isOpen = !collapsed.has(node.hierarchyId);

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

  // Multiple configs: the plugin name is a group; each config is its own row,
  // shown above any descendant plugins.
  if (registrations.length > 1) {
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
        <CollapsibleContent>
          {registrations.map((reg) => (
            <ConfigLeafRow
              key={reg.storePath}
              registration={reg}
              label={reg.descriptor.name}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
          {childRows}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  const registration = registrations[0];

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

  // Combined: selectable plugin row that also expands to its descendants.
  if (hasChildren && registration) {
    const selected = selectedPath === encodeURIComponent(registration.storePath);
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
            label={node.name}
            selected={selected}
            onClick={() => onSelect(registration)}
          />
        </div>
        <CollapsibleContent>{childRows}</CollapsibleContent>
      </Collapsible>
    );
  }

  // Leaf: single config, no config-bearing descendants. The plugin name itself
  // opens the config. The spacer keeps the label aligned with chevron rows.
  if (registration) {
    return (
      <ConfigLeafRow
        registration={registration}
        label={node.name}
        depth={depth}
        selectedPath={selectedPath}
        onSelect={onSelect}
      />
    );
  }

  return null;
}
