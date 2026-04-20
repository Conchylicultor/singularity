import { MdRateReview, MdWarning } from "react-icons/md";
import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web";
import {
  ConversationCommands as Conversation,
  useMainView,
} from "@plugins/conversations/plugins/conversation-view/web";
import { Button } from "@/components/ui/button";
import { useEditedFiles } from "../../../../web/use-edited-files";
import { reviewMainView, REVIEW_MAIN_VIEW_ID } from "../views";
import { isCoreFile } from "../core-files";

export function ReviewButton({ conversation }: { conversation: ConversationState }) {
  const { files } = useEditedFiles(conversation.id);
  const current = useMainView();
  const isOpen = current?.id === REVIEW_MAIN_VIEW_ID;

  const count = files?.length ?? 0;
  const additions = files?.reduce((sum, f) => sum + f.additions, 0) ?? 0;
  const deletions = files?.reduce((sum, f) => sum + f.deletions, 0) ?? 0;
  const hasCoreFiles = files?.some((f) => isCoreFile(f.path)) ?? false;

  const disabled = files != null && count === 0;

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title={hasCoreFiles ? "Review changes — includes core files, extra care required" : "Review changes"}
      aria-label="Review changes"
      aria-pressed={isOpen}
      disabled={disabled}
      onClick={() => Conversation.OpenMainView(isOpen ? null : reviewMainView())}
      className="gap-1.5"
    >
      <MdRateReview className="size-4" />
      {files !== null && (
        <span className="flex items-center gap-1.5 text-xs tabular-nums">
          <span>{count}</span>
          <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>
          <span className="text-red-600 dark:text-red-400">−{deletions}</span>
          {hasCoreFiles && (
            <MdWarning className="size-3.5 text-amber-500 dark:text-amber-400" />
          )}
        </span>
      )}
    </Button>
  );
}
