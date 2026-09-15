import { MdRefresh } from "react-icons/md";
import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { WithTooltip } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import type { ReloadAdvice } from "../hooks/use-reload-advice";

type ShownAdvice = Exclude<ReloadAdvice, { kind: "none" }>;

function messageFor(advice: ShownAdvice): string {
  if (advice.kind === "stale") {
    return "Server was rebuilt — click to reload this tab";
  }
  return advice.stale
    ? "This tab is out of date and part of the app didn't load — reload to fix"
    : "Part of the app didn't load — reload to fix";
}

/**
 * The Reload segment of the Build pill: shown when the tab is stale or part of
 * the app failed to load. Blue when only stale, red when something failed.
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
  const message = messageFor(advice);
  const broken = advice.kind === "broken";
  return (
    <WithTooltip content={message}>
      <Button
        variant="outline"
        aria-label={message}
        // The tint holds on hover too — it is what says why a reload is due.
        className={cn(
          broken
            ? "text-destructive hover:text-destructive"
            : "text-info hover:text-info",
        )}
        onClick={() => window.location.reload()}
      >
        <MdRefresh />
        Reload
      </Button>
    </WithTooltip>
  );
}
