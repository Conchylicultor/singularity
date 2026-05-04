import { MdCode } from "react-icons/md";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/shared";
import {
  RowActionButton,
  useRowMarkdown,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";

export function MarkdownToggleAction({ event }: { event: JsonlEvent }) {
  if (event.kind !== "assistant-text") return null;
  const { markdownMode, setMarkdownMode } = useRowMarkdown();
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
