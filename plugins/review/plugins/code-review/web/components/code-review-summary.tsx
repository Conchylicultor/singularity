import { useMemo } from "react";
import { MdWarning } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useConfig } from "@plugins/config_v2/web";
import { pushesResource } from "@plugins/tasks/core";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import { useConversationById } from "@plugins/conversations/web";
import { getFileWarningLevel, type FileWarningLevel } from "../core-files";
import { reviewConfig } from "../../shared/config";

const WARNING_ICON_CLASS: Record<"careful" | "critical", string> = {
  careful: "size-3.5 text-amber-500 dark:text-amber-400",
  critical: "size-3.5 text-red-500 dark:text-red-400",
};

export function CodeReviewSummary({
  conversationId,
}: {
  conversationId: string;
  source: unknown;
}) {
  const conversation = useConversationById(conversationId);
  const { files } = useEditedFiles(conversationId);
  const config = useConfig(reviewConfig);
  const safePaths = config.safePaths.map((p) => p.path);
  const carefulPaths = config.carefulPaths.map((p) => p.path);

  const pushesQ = useResource(pushesResource);
  const hasPastPushes = useMemo(
    () => {
      if (!conversation) return false;
      return pushesQ.pending ? false : pushesQ.data.some((p) => p.attemptId === conversation.attemptId);
    },
    [pushesQ, conversation],
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

  if (count === 0 && !hasPastPushes) return null;

  return (
    <span className="flex items-center gap-1.5 text-xs tabular-nums">
      <span>{count}</span>
      <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>
      <span className="text-red-600 dark:text-red-400">−{deletions}</span>
      {maxLevel !== "safe" && (
        <MdWarning className={WARNING_ICON_CLASS[maxLevel]} />
      )}
    </span>
  );
}
