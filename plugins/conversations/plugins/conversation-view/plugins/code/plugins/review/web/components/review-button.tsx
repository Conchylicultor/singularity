import { MdRateReview, MdWarning } from "react-icons/md";
import { useMemo } from "react";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConfigValues } from "@plugins/config/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { pushesResource } from "@plugins/tasks/core";
import { Button } from "@/components/ui/button";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
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

export function ReviewButton() {
  const { conversation } = conversationPane.useData();
  const { files } = useEditedFiles(conversation.id);
  const { isOpen, toggle } = convReviewPane.useToggle({ convId: conversation.id });
  const { safePaths, carefulPaths } = useConfigValues(reviewConfig, "conversation-code-review");

  const pushesQ = useResource(pushesResource);
  const hasPastPushes = useMemo(
    () => pushesQ.pending ? false : pushesQ.data.some((p) => p.attemptId === conversation.attemptId),
    [pushesQ, conversation.attemptId],
  );

  const count = files.length;
  const additions = files.reduce((sum, f) => sum + f.additions, 0);
  const deletions = files.reduce((sum, f) => sum + f.deletions, 0);

  const maxLevel: FileWarningLevel = files.reduce<FileWarningLevel>((max, f) => {
    const level = getFileWarningLevel(f.path, safePaths, carefulPaths);
    if (level === "critical") return "critical";
    if (level === "careful" && max === "safe") return "careful";
    return max;
  }, "safe");

  const disabled = count === 0 && !hasPastPushes;

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title={BUTTON_TITLE[maxLevel]}
      aria-label="Review changes"
      aria-pressed={isOpen}
      disabled={disabled}
      onClick={toggle}
      className="gap-1.5"
    >
      <MdRateReview className="size-4" />
      <span className="flex items-center gap-1.5 text-xs tabular-nums">
        <span>{count}</span>
        <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>
        <span className="text-red-600 dark:text-red-400">−{deletions}</span>
        {maxLevel !== "safe" && (
          <MdWarning className={WARNING_ICON_CLASS[maxLevel]} />
        )}
      </span>
    </Button>
  );
}
