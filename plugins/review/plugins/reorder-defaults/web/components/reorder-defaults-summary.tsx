import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { stagedReorderDefaultsResource } from "@plugins/reorder/plugins/staging/web";

/**
 * Compact count badge for the "Reorder Defaults" review section header: the
 * number of staged "default for everyone" slots. Renders nothing when none are
 * staged (and while the resource is still pending). Mirrors `CodeReviewSummary`.
 */
export function ReorderDefaultsSummary({
  conversationId: _conversationId,
}: {
  conversationId: string;
  source: unknown;
}) {
  const staged = useResource(stagedReorderDefaultsResource);

  if (staged.pending) return null;

  const count = staged.data.length;
  if (count === 0) return null;

  return (
    <Text as="span" variant="caption" className="tabular-nums">
      {count}
    </Text>
  );
}
