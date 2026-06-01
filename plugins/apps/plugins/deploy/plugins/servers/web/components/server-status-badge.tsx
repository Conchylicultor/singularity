import type { ServerStatus } from "../../shared";

const styles: Record<ServerStatus, { bg: string; label: string }> = {
  online: { bg: "bg-success", label: "Online" },
  offline: { bg: "bg-destructive", label: "Offline" },
  unknown: { bg: "bg-muted-foreground", label: "Unknown" },
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
