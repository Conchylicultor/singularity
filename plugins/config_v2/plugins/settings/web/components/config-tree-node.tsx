import { TreeRowChrome } from "@plugins/primitives/plugins/tree/web";
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

/** Label + modified/conflict badge for a selectable config row. */
function ConfigRowContent({
  registration,
  label,
}: {
  registration: ConfigRegistration;
  label: string;
}) {
  const { modifiedCount, hasConflict } = useConfigRowState(registration);
  return (
    <>
      <span className="flex-1 truncate">{label}</span>
      <ConfigRowBadge modifiedCount={modifiedCount} hasConflict={hasConflict} />
    </>
  );
}

/** Selectable config leaf (no expander of its own). */
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
    <TreeRowChrome
      depth={depth}
      hasChildren={false}
      leafChevron={false}
      isOpen={false}
      selected={selected}
      onSelect={() => onSelect(registration)}
    >
      <ConfigRowContent registration={registration} label={label} />
    </TreeRowChrome>
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
  const hasChildNodes = children.length > 0;
  const isOpen = !collapsed.has(node.id);
  const toggle = () => onToggle(node.id, !isOpen);

  const childNodeRows = children.map((child) => (
    <ConfigTreeNode
      key={child.node.id}
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
      <>
        <TreeRowChrome
          depth={depth}
          hasChildren
          isOpen={isOpen}
          onToggle={toggle}
          onSelect={toggle}
        >
          <span className="flex-1 truncate">{node.name}</span>
        </TreeRowChrome>
        {isOpen && (
          <>
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
            {childNodeRows}
          </>
        )}
      </>
    );
  }

  const registration = registrations[0];

  // Pure group: no config of its own, only config-bearing descendants.
  if (hasChildNodes && !registration) {
    return (
      <>
        <TreeRowChrome
          depth={depth}
          hasChildren
          isOpen={isOpen}
          onToggle={toggle}
          onSelect={toggle}
        >
          <span className="flex-1 truncate">{node.name}</span>
        </TreeRowChrome>
        {isOpen && childNodeRows}
      </>
    );
  }

  // Combined: selectable plugin row that also expands to its descendants.
  if (hasChildNodes && registration) {
    const selected =
      selectedPath === encodeURIComponent(registration.storePath);
    return (
      <>
        <TreeRowChrome
          depth={depth}
          hasChildren
          isOpen={isOpen}
          selected={selected}
          onToggle={toggle}
          onSelect={() => onSelect(registration)}
        >
          <ConfigRowContent registration={registration} label={node.name} />
        </TreeRowChrome>
        {isOpen && childNodeRows}
      </>
    );
  }

  // Leaf: single config, no config-bearing descendants. The plugin name itself
  // opens the config.
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
