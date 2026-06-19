import { MdCode } from "react-icons/md";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import {
  RowActionButton,
  useRowMarkdown,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";

export function RawTextToggleAction({ event }: { event: JsonlEvent }) {
  const { markdownMode, setMarkdownMode } = useRowMarkdown();
  if (event.kind !== "user-text") return null;
  return (
    <RowActionButton
      title={markdownMode ? "Show raw text" : "Show rich text"}
      active={markdownMode}
      onClick={() => setMarkdownMode(!markdownMode)}
    >
      <MdCode className="size-3" />
    </RowActionButton>
  );
}
