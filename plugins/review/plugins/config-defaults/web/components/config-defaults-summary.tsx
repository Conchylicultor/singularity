import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { stagedConfigDefaultsResource } from "@plugins/config_v2/plugins/staging/web";

/**
 * Compact count badge for the "Default for everyone" review section header: the
 * number of staged config defaults. Renders nothing when none are staged (and
 * while the resource is still pending). Mirrors `CodeReviewSummary`.
 */
export function ConfigDefaultsSummary({
  conversationId: _conversationId,
}: {
  conversationId: string;
  source: unknown;
}) {
  const staged = useResource(stagedConfigDefaultsResource);

  if (staged.pending) return null;

  const count = staged.data.length;
  if (count === 0) return null;

  return (
    <Text as="span" variant="caption" className="tabular-nums">
      {count}
    </Text>
  );
}
