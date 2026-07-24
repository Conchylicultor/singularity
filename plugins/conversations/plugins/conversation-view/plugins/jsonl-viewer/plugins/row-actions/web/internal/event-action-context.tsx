import { createContext, useContext, type ReactNode } from "react";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { hoverRevealTarget } from "@plugins/primitives/plugins/hover-reveal/web";
import { JsonlRowActions } from "../slots";

const EventActionContext = createContext<JsonlEvent | null>(null);

export function EventActionProvider({
  event,
  children,
}: {
  event: JsonlEvent;
  children: ReactNode;
}) {
  return (
    <EventActionContext.Provider value={event}>
      {children}
    </EventActionContext.Provider>
  );
}

/**
 * In-flow, hover-revealed cluster of the universal row actions (timestamp,
 * raw-json, copy, markdown-toggle, …). Reads the current event from context and
 * renders the `JsonlRowActions.Item` contributions. Placed by each renderer
 * inside its own header row so it aligns with the header's right edge, occupies
 * only that line (body full width below), and never spills onto the next turn —
 * opacity-only reveal means no reflow. Pass `floating` for the headerless text/
 * image renderers so the buttons stay legible over prose.
 *
 * The reveal (opacity ⇄ pointer-events ⇄ select-none coupling) is owned by the
 * `hover-reveal` primitive's {@link hoverRevealTarget}, keyed on the row's
 * `hoverRevealGroup` set by `EventRow` — so the cluster is never a live
 * click-target nor part of a Ctrl+A / drag selection over the transcript.
 *
 * The default target (not the group-focus opt-in) is exactly right here: a
 * transcript row wraps a focusable select-scope text region, and the default
 * reveals only on hover or on the actions' OWN focus — so clicking a turn and
 * moving the pointer away hides them (no pinning), while a keyboard user tabbing
 * into the action cluster still sees it.
 */
export function RowActions({
  className,
  floating,
}: {
  className?: string;
  floating?: boolean;
}) {
  const event = useContext(EventActionContext);
  const actions = JsonlRowActions.Item.useContributions();
  if (!event) return null;
  if (actions.length === 0) return null;
  return (
    <Stack
      direction="row"
      align="center"
      gap="xs"
      // eslint-disable-next-line layout/no-adhoc-layout -- rigid action strip; stays whole when hosted in a non-Frame flex parent (floating headerless renderers)
      className={cn(
        "shrink-0",
        hoverRevealTarget,
        floating && "rounded-lg border border-border/60 bg-background/90 px-xs py-2xs shadow-md backdrop-blur-sm",
        className,
      )}
    >
      <JsonlRowActions.Item.Render>
        {(item) => <item.component event={event} />}
      </JsonlRowActions.Item.Render>
    </Stack>
  );
}
