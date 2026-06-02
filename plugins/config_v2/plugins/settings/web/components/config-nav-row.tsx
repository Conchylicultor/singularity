import { cn } from "@/lib/utils";
import type { ConfigRegistration } from "@plugins/config_v2/web";
import { useConfigRowState } from "../internal/use-config-row-state";
import { ConfigRowBadge } from "./config-row-badge";

export function ConfigNavRow({
  registration,
  selected,
  onClick,
  hideIfUnmodified,
  depth,
}: {
  registration: ConfigRegistration;
  selected: boolean;
  onClick: () => void;
  hideIfUnmodified?: boolean;
  depth?: number;
}) {
  const { modifiedCount, hasConflict } = useConfigRowState(registration);

  if (hideIfUnmodified && modifiedCount === 0 && !hasConflict) return null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-md py-1.5 text-left text-sm",
        "hover:bg-accent",
        selected && "bg-accent",
        depth == null && "px-2",
      )}
      style={depth != null ? { paddingLeft: depth * 12 + 8, paddingRight: 8 } : undefined}
    >
      <span className="truncate">{registration.pluginName}</span>
      <ConfigRowBadge modifiedCount={modifiedCount} hasConflict={hasConflict} />
    </button>
  );
}
