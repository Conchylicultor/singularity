import type { JsonlEvent } from "../../shared";
import { JsonlViewer } from "../slots";

function UnknownEventRow({ event }: { event: JsonlEvent }) {
  return (
    <div className="px-3 py-1.5 text-xs text-muted-foreground font-mono">
      <span className="text-yellow-500">Unknown {event.kind} event.</span>{" "}
      Payload: {JSON.stringify(event)}
    </div>
  );
}

export function EventRow({ event, markdownMode }: { event: JsonlEvent; markdownMode?: boolean }) {
  const contributions = JsonlViewer.EventRenderer.useContributions();
  const match = contributions.find((c) => c.kind === event.kind);
  if (!match) return <UnknownEventRow event={event} />;
  return <match.component event={event} markdownMode={markdownMode} />;
}
