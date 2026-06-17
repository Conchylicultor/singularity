import { useState } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { Server } from "../../shared";
import { deleteServer } from "../../shared/endpoints";
import { ServerStatusBadge } from "./server-status-badge";

export function ServerDetail({ server }: { server: Server }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete server "${server.name}"?`)) return;
    setDeleting(true);
    await fetchEndpoint(deleteServer, { id: server.id });
    setDeleting(false);
  }

  return (
    <div className="flex flex-col gap-lg p-lg">
      <div className="flex items-start justify-between">
        <Stack gap="xs">
          <div className="flex items-center gap-sm">
            <Text as="h3" variant="subheading">{server.name}</Text>
            <ServerStatusBadge status={server.status} />
          </div>
          <Text as="div" variant="body" className="text-muted-foreground">
            {server.sshUser}@{server.host}:{server.port}
          </Text>
        </Stack>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-caption text-destructive hover:underline disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      <Text as="div" variant="caption" className="flex gap-lg">
        <div>
          <span className="text-muted-foreground">SSH Key: </span>
          <span className={server.sshKeyConfigured ? "text-success" : "text-warning"}>
            {server.sshKeyConfigured ? "Configured" : "Not set"}
          </span>
        </div>
      </Text>
    </div>
  );
}
