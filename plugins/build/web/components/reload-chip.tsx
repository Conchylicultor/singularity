import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { WithTooltip } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";
import { useReloadAdvice } from "../hooks/use-reload-advice";
import { reloadIsFailing, reloadMessageFor } from "../internal/reload-copy";

const refreshIcon = symbol("refresh");

/**
 * The collapsed floating bar's Reload chip (`ActionBar.Glance`): the same
 * advice as the Build pill's Reload segment, as a FILLED pill — it is the one
 * thing the closed bar asks the user to do, so it reads as a button, not a
 * status. Blue when the tab is only stale, red when something already fails.
 * Renders nothing when no reload is due.
 */
export function ReloadChip() {
  const advice = useReloadAdvice();
  if (advice.kind === "none") return null;
  const message = reloadMessageFor(advice);
  return (
    <WithTooltip content={message}>
      <Button
        shape="pill"
        aria-label={message}
        className={cn(
          reloadIsFailing(advice)
            ? "bg-destructive text-white hover:bg-destructive/85"
            : "bg-info text-info-foreground hover:bg-info/85",
        )}
        onClick={() => window.location.reload()}
      >
        <Icon icon={refreshIcon} />
        Reload
      </Button>
    </WithTooltip>
  );
}
