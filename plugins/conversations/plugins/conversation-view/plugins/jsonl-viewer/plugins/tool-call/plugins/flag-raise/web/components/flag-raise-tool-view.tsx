import { MdFlag } from "react-icons/md";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";

type FlagRaiseInput = {
  reason: string;
};

export function FlagRaiseToolView({ event }: ToolRendererProps) {
  const input = event.input as FlagRaiseInput;

  return (
    <ToolCallCard event={event} summary="Flagged for review" defaultOpen>
      <div className="mt-2 flex items-start gap-2 rounded border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
        <MdFlag className="mt-0.5 size-4 shrink-0 text-yellow-500" />
        <p className="text-xs whitespace-pre-wrap">{input.reason}</p>
      </div>
      {event.result?.isError && (
        <p className="mt-2 text-xs text-destructive">{event.result.content}</p>
      )}
    </ToolCallCard>
  );
}
