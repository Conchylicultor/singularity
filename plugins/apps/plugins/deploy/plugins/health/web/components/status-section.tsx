import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import type { Server } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import { useServerHealth } from "../hooks";
import { ServerStatusBadge, serverStatus } from "./server-status-badge";

/**
 * The status section's collapsed preview: the same badge as the servers list's
 * `status` field. It rides `summary` rather than the body so the verdict stays
 * readable with the card shut — which is how this section is normally used.
 *
 * It is contributed rather than read off the server row because the registry
 * owns a server's identity, not its liveness: the verdict lives in this
 * plugin's side-table and only a real probe can write it.
 */
export function ServerStatusSummary({ server }: { server: Server }) {
  const row = useServerHealth(server.id);
  return <ServerStatusBadge status={serverStatus(row)} />;
}

/** What the last probe actually found: when it ran, why it failed, what it is. */
export function ServerStatusSection({ server }: { server: Server }) {
  const row = useServerHealth(server.id);

  if (!row) {
    return (
      <Text as="p" variant="body" className="text-muted-foreground">
        Never checked — run the SSH connection test below.
      </Text>
    );
  }

  return (
    <Stack gap="xs">
      <Text as="p" variant="body" className="text-muted-foreground">
        Last checked <RelativeTime date={row.checkedAt} />
      </Text>
      {row.ok ? (
        <Text as="p" variant="body" className="text-muted-foreground">
          Platform: {row.platform ?? "unrecognized"}
        </Text>
      ) : (
        <Text as="p" variant="body" className="text-destructive">
          {row.failureMessage ?? row.failureKind ?? "The last probe failed."}
        </Text>
      )}
    </Stack>
  );
}
