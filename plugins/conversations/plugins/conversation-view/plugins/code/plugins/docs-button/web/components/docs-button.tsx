import { useMemo } from "react";
import { MdArticle } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Button } from "@/components/ui/button";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import { convDocsPane, isDocFile } from "../panes";
import { usePushedDocFiles } from "../use-pushed-doc-files";

export function DocsButton() {
  const { conversation } = conversationPane.useData();
  const { files } = useEditedFiles(conversation.id);
  const pushedDocs = usePushedDocFiles(conversation.attemptId);
  const { isOpen, toggle } = convDocsPane.useToggle({ convId: conversation.id });

  const workingDocs = useMemo(() => files.filter((f) => isDocFile(f.path)), [files]);

  const count = useMemo(() => {
    if (workingDocs.length === 0 && pushedDocs === null) return null;
    const workingPaths = new Set(workingDocs.map((f) => f.path));
    const pushedOnlyCount = (pushedDocs ?? []).filter((f) => !workingPaths.has(f.path)).length;
    return workingDocs.length + pushedOnlyCount;
  }, [workingDocs, pushedDocs]);

  const disabled = count !== null && count === 0;

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title="Design docs"
      aria-label="Design docs"
      aria-pressed={isOpen}
      disabled={disabled}
      onClick={toggle}
      className="gap-1.5"
    >
      <MdArticle className="size-4" />
      {count !== null && <span className="tabular-nums text-xs">{count}</span>}
    </Button>
  );
}
