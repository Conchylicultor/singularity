import { MdRateReview, MdWarning } from "react-icons/md";
import { useMemo } from "react";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { usePaneMatch } from "@plugins/primitives/plugins/pane/web";
import { useConfigValues } from "@plugins/config/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { pushesResource } from "@plugins/tasks/shared";
import { Button } from "@/components/ui/button";
import { useEditedFiles } from "../../../../web/use-edited-files";
import { convReviewPane } from "../panes";
import { getFileWarningLevel, type FileWarningLevel } from "../core-files";
import { reviewConfig } from "../../shared/config";

const BUTTON_TITLE: Record<FileWarningLevel, string> = {
  safe: "Review changes",
  careful: "Review changes — includes files requiring extra care",
  critical: "Review changes — includes critical infrastructure files",
};

const WARNING_ICON_CLASS: Record<"careful" | "critical", string> = {
  careful: "size-3.5 text-amber-500 dark:text-amber-400",
  critical: "size-3.5 text-red-500 dark:text-red-400",
};

export function ReviewButton({ conversation }: { conversation: ConversationRecord }) {
  const { files } = useEditedFiles(conversation.id);
  const match = usePaneMatch();
  const isOpen =
    match?.chain.some((e) => e.pane === convReviewPane._internal) ?? false;
  const { safePaths, carefulPaths } = useConfigValues(reviewConfig, "conversation-code-review");

  const pushesQ = useResource(pushesResource);
  const hasPastPushes = useMemo(
    () => (pushesQ.data ?? []).some((p) => p.attemptId === conversation.attemptId),
    [pushesQ.data, conversation.attemptId],
  );

  const count = files?.length ?? 0;
  const additions = files?.reduce((sum, f) => sum + f.additions, 0) ?? 0;
  const deletions = files?.reduce((sum, f) => sum + f.deletions, 0) ?? 0;

  const maxLevel: FileWarningLevel = files
    ? files.reduce<FileWarningLevel>((max, f) => {
        const level = getFileWarningLevel(f.path, safePaths, carefulPaths);
        if (level === "critical") return "critical";
        if (level === "careful" && max === "safe") return "careful";
        return max;
      }, "safe")
    : "safe";

  const disabled = files != null && count === 0 && !hasPastPushes;

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title={BUTTON_TITLE[maxLevel]}
      aria-label="Review changes"
      aria-pressed={isOpen}
      disabled={disabled}
      onClick={() =>
        isOpen
          ? convReviewPane.close()
          : convReviewPane.open({ convId: conversation.id })
      }
      className="gap-1.5"
    >
      <MdRateReview className="size-4" />
      {files !== null && (
        <span className="flex items-center gap-1.5 text-xs tabular-nums">
          <span>{count}</span>
          <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>
          <span className="text-red-600 dark:text-red-400">−{deletions}</span>
          {maxLevel !== "safe" && (
            <MdWarning className={WARNING_ICON_CLASS[maxLevel]} />
          )}
        </span>
      )}
    </Button>
  );
}
