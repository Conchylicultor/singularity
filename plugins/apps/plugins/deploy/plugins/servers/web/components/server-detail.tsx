import { useState } from "react";
import type { Server } from "../../shared";
import { ServerStatusBadge } from "./server-status-badge";

export function ServerDetail({ server }: { server: Server }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete server "${server.name}"?`)) return;
    setDeleting(true);
    await fetch(`/api/deploy/servers/${server.id}`, { method: "DELETE" });
    setDeleting(false);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{server.name}</h3>
            <ServerStatusBadge status={server.status} />
          </div>
          <div className="text-muted-foreground mt-1 text-sm">
            {server.sshUser}@{server.host}:{server.port}
          </div>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-destructive text-xs hover:underline disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      <div className="flex gap-4 text-xs">
        <div>
          <span className="text-muted-foreground">SSH Key: </span>
          <span className={server.sshKeyConfigured ? "text-success" : "text-warning"}>
            {server.sshKeyConfigured ? "Configured" : "Not set"}
          </span>
        </div>
      </div>
    </div>
  );
}
