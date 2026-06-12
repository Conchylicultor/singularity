import { MdWarning } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { useConfig } from "@plugins/config_v2/web";
import { pushesResource } from "@plugins/tasks/core";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import { useConversationById } from "@plugins/conversations/web";
import { getFileWarningLevel, type FileWarningLevel } from "../core-files";
import { reviewConfig } from "../../shared/config";

const WARNING_ICON_CLASS: Record<"careful" | "critical", string> = {
  careful: "size-3.5 text-warning",
  critical: "size-3.5 text-destructive",
};

export function CodeReviewSummary({
  conversationId,
}: {
  conversationId: string;
  source: unknown;
}) {
  const conversation = useConversationById(conversationId);
  const filesResult = useEditedFiles(conversationId);
  const config = useConfig(reviewConfig);
  const safePaths = config.safePaths.map((p) => p.path);
  const carefulPaths = config.carefulPaths.map((p) => p.path);

  const pushesQ = useResource(pushesResource);

  // Gate: render nothing while pushes are loading so hasPastPushes is never
  // incorrectly false (which would hide the file-stats row on a past-push conversation).
  if (pushesQ.pending) return null;
  // Same gate for edited-files: collapsing pending to an empty list would show a
  // confidently-wrong "0 +0 −0" (and hide warnings) until the resource settles.
  if (filesResult.pending) return null;
  const files = filesResult.data;

  const hasPastPushes = conversation
    ? pushesQ.data.some((p) => p.attemptId === conversation.attemptId)
    : false;

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
    <Text as="span" variant="caption" className="flex items-center gap-1.5 tabular-nums">
      <span>{count}</span>
      <span className="text-success">+{additions}</span>
      <span className="text-destructive">−{deletions}</span>
      {maxLevel !== "safe" && (
        <MdWarning className={WARNING_ICON_CLASS[maxLevel]} />
      )}
    </Text>
  );
}
