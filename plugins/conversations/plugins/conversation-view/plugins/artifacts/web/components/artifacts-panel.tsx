import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { ArtifactItem } from "@plugins/conversations/plugins/conversation-view/plugins/artifacts/core";
import { ConversationArtifacts } from "../slots";
import { ArtifactSection } from "./artifact-section";

/**
 * The popover's body: a heading, then one block per registered kind that found
 * something, in the order the reorder config puts them.
 *
 * This file names no kind. It reads each one's label off the registry and hands
 * it its own items — so "files changed", "tasks filed" or anything else is one
 * new sub-plugin and no edit here.
 */
export function ArtifactsPanel({
  byKind,
  total,
}: {
  byKind: ReadonlyMap<string, ArtifactItem[]>;
  total: number;
}) {
  return (
    <>
      <Line className="gap-sm border-b px-sm py-xs">
        <Fill>
          <Text variant="label" className="font-semibold">
            Artifacts
          </Text>
        </Fill>
        <Text variant="caption" className="tabular-nums text-muted-foreground">
          {total}
        </Text>
      </Line>
      <Stack gap="sm" className="p-xs">
        <ConversationArtifacts.Kind.Render>
          {(kind) => {
            const items = byKind.get(kind.id);
            if (items === undefined || items.length === 0) return null;
            return (
              <ArtifactSection label={kind.label}>
                <kind.Section items={items} />
              </ArtifactSection>
            );
          }}
        </ConversationArtifacts.Kind.Render>
      </Stack>
    </>
  );
}
