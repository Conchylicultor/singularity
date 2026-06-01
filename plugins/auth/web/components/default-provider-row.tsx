import { useState } from "react";
import { Auth } from "../slots";
import { useAccountStatus } from "../hooks";
import { Button } from "@/components/ui/button";
import { toast } from "@plugins/notifications/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { configNavPane } from "@plugins/config_v2/plugins/settings/web";
import { currentWorktreeName, disconnect, startConnectFlow } from "../connect";

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
          description: `Connected ${provider?.name ?? providerId}${
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
        description: `Disconnected ${provider?.name ?? providerId}`,
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
    <div className="flex items-start gap-4 p-4">
      <Icon className="mt-1 h-6 w-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{provider.name}</span>
          <StatusPill
            connected={connected}
            needsReconsent={needsReconsent}
            credentialsMissing={!!credentialsMissing}
          />
        </div>
        {status?.identity?.email ? (
          <div className="text-sm text-muted-foreground truncate">
            {status.identity.email}
          </div>
        ) : null}
        {status?.scopes && status.scopes.length > 0 ? (
          <details className="mt-1 text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              {status.scopes.length} scope{status.scopes.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-1 list-disc pl-4">
              {status.scopes.map((s) => (
                <li key={s} className="break-all">{s}</li>
              ))}
            </ul>
          </details>
        ) : null}
        {status?.lastRefreshError ? (
          <div className="mt-1 text-xs text-warning">
            Last refresh failed:{" "}
            <span className="font-mono">{status.lastRefreshError.message}</span>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {credentialsMissing ? (
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
                disabled={busy}
                onClick={handleConnect}
              >
                Reconnect
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={handleDisconnect}
            >
              Disconnect
            </Button>
          </>
        ) : (
          <Button
            variant="default"
            size="sm"
            disabled={busy}
            onClick={handleConnect}
          >
            Connect
          </Button>
        )}
      </div>
    </div>
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
    return (
      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
        Setup required
      </span>
    );
  }
  if (needsReconsent) {
    return (
      <span className="rounded bg-warning/15 px-1.5 py-0.5 text-xs text-warning">
        Needs reconsent
      </span>
    );
  }
  if (connected) {
    return (
      <span className="rounded bg-success/15 px-1.5 py-0.5 text-xs text-success">
        Connected
      </span>
    );
  }
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
      Disconnected
    </span>
  );
}
