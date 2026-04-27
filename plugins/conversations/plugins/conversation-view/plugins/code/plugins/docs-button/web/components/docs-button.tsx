import { MdArticle } from "react-icons/md";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { usePaneMatch } from "@plugins/primitives/plugins/pane/web";
import { Button } from "@/components/ui/button";
import { useEditedFiles } from "../../../../web/use-edited-files";
import { convDocsPane, isDocFile } from "../panes";

export function DocsButton({ conversation }: { conversation: ConversationRecord }) {
  const { files } = useEditedFiles(conversation.id);
  const match = usePaneMatch();
  const isOpen =
    match?.chain.some((e) => e.pane === convDocsPane._internal) ?? false;

  const docs = files?.filter((f) => isDocFile(f.path)) ?? null;
  const count = docs?.length ?? 0;
  const disabled = docs != null && count === 0;

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title="Design docs"
      aria-label="Design docs"
      aria-pressed={isOpen}
      disabled={disabled}
      onClick={() =>
        isOpen
          ? convDocsPane.close()
          : convDocsPane.open({ convId: conversation.id })
      }
      className="gap-1.5"
    >
      <MdArticle className="size-4" />
      {docs !== null && <span className="tabular-nums text-xs">{count}</span>}
    </Button>
  );
}
