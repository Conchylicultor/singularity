import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Auth } from "../slots";
import { useAccountStatus } from "../hooks";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { configNavPane } from "@plugins/config_v2/plugins/settings/web";
import { currentWorktreeName, disconnect, startConnectFlow } from "../connect";
import { ScopeGrantNotice } from "./scope-grant-notice";

interface Props {
  providerId: string;
}

export function DefaultProviderRow({ providerId }: Props) {
  const status = useAccountStatus(providerId);
  const providers = Auth.Provider.useContributions();
  const provider = providers.find((p) => p.id === providerId);
  const [busy, setBusy] = useState(false);
  const openPane = useOpenPane();

  if (!provider) return null;
  const Icon = provider.icon;

  async function handleConnect() {
    setBusy(true);
    try {
      const result = await startConnectFlow({
        providerId,
        worktree: currentWorktreeName(),
      });
      if (result.ok) {
        toast({
          type: "auth",
          title: "Connected",
          description: `${provider?.name ?? providerId}${
            result.identity?.email ? ` (${result.identity.email})` : ""
          }`,
          variant: "success",
        });
      } else if (result.message && result.message !== "cancelled") {
        toast({
          type: "auth",
          title: `Failed to connect ${provider?.name ?? providerId}`,
          description: result.message,
          variant: "error",
        });
      }
    } catch (err) {
      toast({
        type: "auth",
        title: `Failed to connect ${provider?.name ?? providerId}`,
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await disconnect(providerId);
      toast({
        type: "auth",
        title: "Disconnected",
        description: `${provider?.name ?? providerId}`,
        variant: "success",
      });
    } catch (err) {
      toast({
        type: "auth",
        title: "Disconnect failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const credentialsMissing = status && !status.credentialsConfigured;
  const needsReconsent = status?.needsReconsent;
  const connected = status?.connected;

  return (
    <Frame
      className="p-lg"
      gap="lg"
      align="start"
      leading={
        // eslint-disable-next-line spacing/no-adhoc-spacing -- top offset to baseline-align icon with adjacent text
        <Icon className="mt-1 h-6 w-6" />
      }
      // The info column must FILL the row (email truncates against the leftover
      // width), so it lives in the flexible `meta` track, not `content`.
      meta={
        <>
          <Stack direction="row" align="center" gap="sm">
            <span className="font-medium">{provider.name}</span>
            <StatusPill
              connected={connected}
              needsReconsent={needsReconsent}
              credentialsMissing={!!credentialsMissing}
            />
          </Stack>
          {status?.identity?.email ? (
            <Text as="div" variant="body" className="text-muted-foreground truncate">
              {status.identity.email}
            </Text>
          ) : null}
          {status?.scopes && status.scopes.length > 0 ? (
            // eslint-disable-next-line spacing/no-adhoc-spacing -- vertical offset from preceding sibling block
            <details className="mt-1 text-caption text-muted-foreground">
              <summary className="cursor-pointer">
                {status.scopes.length} scope{status.scopes.length === 1 ? "" : "s"}
              </summary>
              {/* eslint-disable-next-line spacing/no-adhoc-spacing -- list offset below summary + indent for nested list */}
              <ul className="mt-1 list-disc pl-4">
                {status.scopes.map((s) => (
                  <li key={s} className="break-all">{s}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {connected && status && !credentialsMissing ? (
            <ScopeGrantNotice providerId={providerId} status={status} />
          ) : null}
          {status?.lastRefreshError ? (
            // eslint-disable-next-line spacing/no-adhoc-spacing -- vertical offset from preceding sibling block
            <Text as="div" variant="caption" className="mt-1 text-warning">
              Last refresh failed:{" "}
              <span className="font-mono">{status.lastRefreshError.message}</span>
            </Text>
          ) : null}
        </>
      }
      trailing={
        credentialsMissing ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              provider.configureCredentials
                ? provider.configureCredentials()
                : openPane(configNavPane, {}, { mode: "push" })
            }
          >
            Configure credentials
          </Button>
        ) : connected ? (
          <>
            {needsReconsent ? (
              <Button
                variant="default"
                size="sm"
                loading={busy}
                onClick={handleConnect}
              >
                Reconnect
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              loading={busy}
              onClick={handleDisconnect}
            >
              Disconnect
            </Button>
          </>
        ) : (
          <Button
            variant="default"
            size="sm"
            loading={busy}
            onClick={handleConnect}
          >
            Connect
          </Button>
        )
      }
    />
  );
}

function StatusPill({
  connected,
  needsReconsent,
  credentialsMissing,
}: {
  connected: boolean | undefined;
  needsReconsent: boolean | undefined;
  credentialsMissing: boolean;
}) {
  if (credentialsMissing) {
    return <Badge variant="muted">Setup required</Badge>;
  }
  if (needsReconsent) {
    return <Badge variant="warning">Needs reconsent</Badge>;
  }
  if (connected) {
    return <Badge variant="success">Connected</Badge>;
  }
  return <Badge variant="muted">Disconnected</Badge>;
}
