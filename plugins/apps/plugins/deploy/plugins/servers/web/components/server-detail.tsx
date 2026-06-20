import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { Server } from "../../shared";
import { deleteServer } from "../../shared/endpoints";
import { ServerStatusBadge } from "./server-status-badge";

export function ServerDetail({ server }: { server: Server }) {
  async function handleDelete() {
    if (!confirm(`Delete server "${server.name}"?`)) return;
    await fetchEndpoint(deleteServer, { id: server.id });
  }

  return (
    <Stack gap="lg" className="p-lg">
      <Frame
        align="start"
        content={
          <Stack gap="xs">
            <Stack direction="row" align="center" gap="sm">
              <Text as="h3" variant="subheading">{server.name}</Text>
              <ServerStatusBadge status={server.status} />
            </Stack>
            <Text as="div" variant="body" className="text-muted-foreground">
              {server.sshUser}@{server.host}:{server.port}
            </Text>
          </Stack>
        }
        trailing={
          <Button
            variant="link"
            onClick={handleDelete}
            className="text-destructive hover:text-destructive"
          >
            Delete
          </Button>
        }
      />
      <Stack as="div" direction="row" gap="lg">
        <Text as="div" variant="caption">
          <span className="text-muted-foreground">SSH Key: </span>
          <span className={server.sshKeyConfigured ? "text-success" : "text-warning"}>
            {server.sshKeyConfigured ? "Configured" : "Not set"}
          </span>
        </Text>
      </Stack>
    </Stack>
  );
}
