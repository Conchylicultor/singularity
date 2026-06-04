import { TreeRowChrome } from "@plugins/primitives/plugins/tree/web";
import type { ConfigRegistration } from "@plugins/config_v2/web";
import { useConfigRowState } from "../internal/use-config-row-state";
import { ConfigRowBadge } from "./config-row-badge";

export function ConfigNavRow({
  registration,
  selected,
  onClick,
  hideIfUnmodified,
}: {
  registration: ConfigRegistration;
  selected: boolean;
  onClick: () => void;
  hideIfUnmodified?: boolean;
}) {
  const { modifiedCount, hasConflict } = useConfigRowState(registration);

  if (hideIfUnmodified && modifiedCount === 0 && !hasConflict) return null;

  return (
    <TreeRowChrome
      depth={0}
      hasChildren={false}
      isOpen={false}
      selected={selected}
      onSelect={onClick}
    >
      <span className="flex-1 truncate">{registration.pluginName}</span>
      <ConfigRowBadge modifiedCount={modifiedCount} hasConflict={hasConflict} />
    </TreeRowChrome>
  );
}
