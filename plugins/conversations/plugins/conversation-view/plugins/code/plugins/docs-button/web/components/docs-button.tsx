import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo } from "react";
import { MdArticle } from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import type { EditedFile } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { convDocsPane, isDocFile } from "../panes";
import { usePushedDocFiles } from "../use-pushed-doc-files";

export function DocsButton() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const filesResult = useEditedFiles(convId);
  const pushedDocs = usePushedDocFiles(conversation?.attemptId ?? "");
  const { isOpen, toggle } = convDocsPane.useToggle({}, { input: { convId } });

  // While edited files are still loading, render a neutral disabled button (no
  // count badge) rather than collapsing pending → an empty file list, which
  // would flash a confidently-wrong count. The settled-data body — count math
  // that uses hooks — lives in DocsButtonReady so all hooks here run first.
  if (filesResult.pending) {
    return (
      <Button
        variant="ghost"
        title="Design docs"
        aria-label="Design docs"
        disabled
        className="gap-xs"
      >
        <MdArticle className="size-4" />
      </Button>
    );
  }

  return (
    <DocsButtonReady
      files={filesResult.data}
      pushedDocs={pushedDocs}
      isOpen={isOpen}
      onToggle={toggle}
    />
  );
}

function DocsButtonReady({
  files,
  pushedDocs,
  isOpen,
  onToggle,
}: {
  files: EditedFile[];
  pushedDocs: EditedFile[] | null;
  isOpen: boolean;
  onToggle: () => void;
}) {
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
      title="Design docs"
      aria-label="Design docs"
      aria-pressed={isOpen}
      disabled={disabled}
      onClick={onToggle}
      className="gap-xs"
    >
      <MdArticle className="size-4" />
      {count !== null && (
        <Text variant="caption" className="tabular-nums">
          {count}
        </Text>
      )}
    </Button>
  );
}
