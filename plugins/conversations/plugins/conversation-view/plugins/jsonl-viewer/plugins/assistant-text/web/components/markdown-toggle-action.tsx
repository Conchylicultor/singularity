import { MdCode } from "react-icons/md";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { useRowMarkdown } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { RowActionButton } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/row-actions/web";

export function MarkdownToggleAction({ event }: { event: JsonlEvent }) {
  const { markdownMode, setMarkdownMode } = useRowMarkdown();
  if (event.kind !== "assistant-text") return null;
  return (
    <RowActionButton
      title={markdownMode ? "Show raw text" : "Render markdown"}
      active={markdownMode}
      onClick={() => setMarkdownMode(!markdownMode)}
    >
      <MdCode className="size-3" />
    </RowActionButton>
  );
}
