import { createContext, useContext, type ReactNode } from "react";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { JsonlViewer } from "../slots";

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
 * renders the `JsonlViewer.RowAction` contributions. Placed by each renderer
 * inside its own header row so it aligns with the header's right edge, occupies
 * only that line (body full width below), and never spills onto the next turn —
 * opacity-only reveal means no reflow. Pass `floating` for the headerless text/
 * image renderers so the buttons stay legible over prose.
 */
export function RowActions({
  className,
  floating,
}: {
  className?: string;
  floating?: boolean;
}) {
  const event = useContext(EventActionContext);
  if (!event) return null;
  const actions = JsonlViewer.RowAction.useContributions();
  if (actions.length === 0) return null;
  return (
    <Stack
      direction="row"
      align="center"
      gap="xs"
      // eslint-disable-next-line layout/no-adhoc-layout -- rigid action strip; stays whole when hosted in a non-Frame flex parent (floating headerless renderers)
      className={cn(
        "shrink-0 opacity-0 pointer-events-none transition-opacity group-hover/row:opacity-100 group-hover/row:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto",
        floating && "rounded-lg border border-border/60 bg-background/90 px-xs py-2xs shadow-md backdrop-blur-sm",
        className,
      )}
    >
      <JsonlViewer.RowAction.Render>
        {(item) => <item.component event={event} />}
      </JsonlViewer.RowAction.Render>
    </Stack>
  );
}
