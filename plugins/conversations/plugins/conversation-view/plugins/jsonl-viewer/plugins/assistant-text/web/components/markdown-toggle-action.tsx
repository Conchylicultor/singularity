import { MdCode } from "react-icons/md";
import type { JsonlEvent } from "../../../../shared";
import { useRowMarkdown } from "../../../../web/components/row-markdown-context";
import { RowActionButton } from "../../../../web/components/row-action-button";

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
