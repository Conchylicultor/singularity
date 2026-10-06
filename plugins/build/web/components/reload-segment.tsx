import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { WithTooltip } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import type { ReloadAdvice } from "../hooks/use-reload-advice";
import { reloadIsFailing, reloadMessageFor } from "../internal/reload-copy";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const refreshIcon = symbol("refresh");

/**
 * The Reload segment of the Build pill: shown when the tab is stale, cannot
 * load some data (outdated), or part of the app failed to load. Blue when only
 * stale, red when something is already failing (outdated or broken).
 *
 * A real `<button>`, joined to the Build button as the pill's second segment
 * (a sibling, never nested inside the popover trigger), so pressing it reloads
 * without opening the Builds popover.
 *
 * The accessible name is the full message, not just "Reload": red and blue are
 * otherwise the only difference between "out of date" and "broken", and the
 * tooltip is only there for a pointer.
 */
export function ReloadSegment({ advice }: { advice: ReloadAdvice }) {
  if (advice.kind === "none") return null;
  const message = reloadMessageFor(advice);
  const failing = reloadIsFailing(advice);
  return (
    <WithTooltip content={message}>
      <Button
        variant="frame"
        aria-label={message}
        // The tint holds on hover too — it is what says why a reload is due.
        className={cn(
          failing
            ? "text-destructive hover:text-destructive"
            : "text-info hover:text-info",
        )}
        onClick={() => window.location.reload()}
      >
        <Icon icon={refreshIcon} />
        Reload
      </Button>
    </WithTooltip>
  );
}
