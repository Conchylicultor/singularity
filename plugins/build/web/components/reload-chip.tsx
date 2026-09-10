import type { KeyboardEvent, MouseEvent } from "react";
import { MdRefresh } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
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
 * The Reload chip on the Build button: shown when the tab is stale or part of
 * the app failed to load. Blue when only stale, red when something failed.
 *
 * It sits INSIDE the Build button (the popover trigger), and a `<button>` —
 * like any interactive content — is invalid inside another `<button>`. So it
 * stays a span that behaves as a button: `role`, `tabIndex`, and Enter/Space
 * wired by hand. Both handlers stop propagation so pressing the chip reloads
 * without also opening the Builds popover.
 *
 * The accessible name is the full message, not just "Reload": red and blue are
 * otherwise the only difference between "out of date" and "broken", and the
 * tooltip is only there for a pointer.
 */
export function ReloadChip({ advice }: { advice: ReloadAdvice }) {
  if (advice.kind === "none") return null;
  const message = messageFor(advice);
  const broken = advice.kind === "broken";
  const reload = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    window.location.reload();
  };
  return (
    <WithTooltip content={message}>
      <Badge
        as="span"
        role="button"
        tabIndex={0}
        aria-label={message}
        variant={broken ? "destructive" : "info"}
        icon={<MdRefresh />}
        // eslint-disable-next-line spacing/no-adhoc-spacing -- inline offset from the Build button's label; the chip is a leaf inside the button, which owns no gap for it
        className={`ml-0.5 focus-ring transition-colors ${broken ? "hover:bg-destructive/25" : "hover:bg-info/25"}`}
        onClick={reload}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          // Space would otherwise scroll the page; Enter would reach the button.
          e.preventDefault();
          reload(e);
        }}
      >
        Reload
      </Badge>
    </WithTooltip>
  );
}
