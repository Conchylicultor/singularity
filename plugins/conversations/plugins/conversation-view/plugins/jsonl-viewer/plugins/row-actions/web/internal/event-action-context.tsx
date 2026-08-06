import { createContext, useContext, type ReactNode } from "react";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { RowActions } from "@plugins/primitives/plugins/row-actions/web";
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
 * The universal row actions (timestamp, raw-json, copy, markdown-toggle, …) for
 * one transcript event. This plugin owns WHICH actions a row carries — the
 * per-event context and the `JsonlRowActions.Item` contributions — and nothing
 * else: the reveal, the click/pointerdown guards, the popup-hold and the control
 * size all belong to the shared `primitives/row-actions` cluster, so a transcript
 * row behaves exactly like every other row-action cluster in the app.
 *
 * `pin={null}` because the HOST places it: the header renderers drop it into
 * their own trailing slot so it aligns with the header's right edge and never
 * spills onto the next turn, and the headerless text/image renderers wrap it in
 * their own `Pin`. Those pass `floating`, which paints the cluster on its own
 * overlay surface so the buttons stay legible over prose.
 */
export function EventRowActions({
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
    <RowActions pin={null} surface={floating} className={className}>
      <JsonlRowActions.Item.Render>
        {(item) => <item.component event={event} />}
      </JsonlRowActions.Item.Render>
    </RowActions>
  );
}
