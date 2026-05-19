import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@plugins/notifications/web";
import { currentWorktreeName, startConnectFlow } from "../connect";

export interface ConnectButtonProps {
  providerId: string;
  scopes?: string[];
  label?: string;
  onConnected?: (identity: { email?: string; accountId: string }) => void;
}

export function ConnectButton({
  providerId,
  scopes,
  label = "Connect",
  onConnected,
}: ConnectButtonProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const result = await startConnectFlow({
            providerId,
            worktree: currentWorktreeName(),
            scopes,
          });
          if (result.ok && result.identity) {
            onConnected?.(result.identity);
            toast({
              type: "auth",
              description: `Connected (${result.identity.email ?? result.identity.accountId})`,
              variant: "success",
            });
          } else if (result.message && result.message !== "cancelled") {
            toast({
              type: "auth",
              title: "Connect failed",
              description: result.message,
              variant: "error",
            });
          }
        } catch (err) {
          toast({
            type: "auth",
            title: "Connect failed",
            description: err instanceof Error ? err.message : String(err),
            variant: "error",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </Button>
  );
}
