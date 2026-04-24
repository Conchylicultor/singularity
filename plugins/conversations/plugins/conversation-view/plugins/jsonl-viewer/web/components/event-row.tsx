import type { JsonlEvent } from "../../shared";
import { JsonlViewer } from "../slots";

export function EventRow({ event, markdownMode }: { event: JsonlEvent; markdownMode?: boolean }) {
  const contributions = JsonlViewer.EventRenderer.useContributions();
  const match = contributions.find((c) => c.kind === event.kind);
  if (!match) return null;
  return <match.component event={event} markdownMode={markdownMode} />;
}
