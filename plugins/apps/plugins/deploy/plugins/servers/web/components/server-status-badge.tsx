import type { ServerStatus } from "@plugins/apps/plugins/deploy/plugins/servers/shared";

const styles: Record<ServerStatus, { bg: string; label: string }> = {
  online: { bg: "bg-green-500", label: "Online" },
  offline: { bg: "bg-red-500", label: "Offline" },
  unknown: { bg: "bg-zinc-400", label: "Unknown" },
};

export function ServerStatusBadge({ status }: { status: ServerStatus }) {
  const { bg, label } = styles[status];
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className={`inline-block size-2 rounded-full ${bg}`} />
      {label}
    </span>
  );
}
