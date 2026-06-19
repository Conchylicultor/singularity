import { useState } from "react";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { useAccountStatus } from "../hooks";
import { currentWorktreeName, startConnectFlow } from "../connect";
import { mergeScopes } from "../scopes";

/**
 * Reusable "Grant access" affordance for an OAuth provider + scope set.
 *
 * Requests the UNION of already-granted + requested scopes so the OAuth
 * callback's full-replace of stored scopes can't drop scopes the rest of the
 * app relies on.
 */
export function GrantAccessButton(props: {
  providerId: string;
  scopes: string[];
  label?: string;
  variant?: "default" | "outline";
  size?: "sm" | "default";
}) {
  const {
    providerId,
    scopes,
    label = "Grant access",
    variant = "outline",
    size = "sm",
  } = props;
  const status = useAccountStatus(providerId);
  const [busy, setBusy] = useState(false);

  async function handleGrant() {
    setBusy(true);
    try {
      const result = await startConnectFlow({
        providerId,
        worktree: currentWorktreeName(),
        scopes: mergeScopes(status?.scopes, scopes),
      });
      if (result.ok) {
        toast({
          type: "auth",
          title: "Access granted",
          description: label,
          variant: "success",
        });
      } else if (result.message && result.message !== "cancelled") {
        toast({
          type: "auth",
          title: "Failed to grant access",
          description: result.message,
          variant: "error",
        });
      }
    } catch (err) {
      toast({
        type: "auth",
        title: "Failed to grant access",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} size={size} loading={busy} onClick={handleGrant}>
      {label}
    </Button>
  );
}
