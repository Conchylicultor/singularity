import type { JsonlEvent } from "../../../../shared";
import { CopyTextAction } from "../../../../web/components/copy-button";

export function CopyToolResultAction({ event }: { event: JsonlEvent }) {
  if (event.kind !== "user-tool-result") return null;
  return <CopyTextAction text={event.content ?? ""} title="Copy result" />;
}
