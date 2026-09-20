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
 * The heading carries no number. The button's number is what the conversation
 * MADE, and the panel lists more than that (the pictures it looked at, the
 * skills it loaded) — so a second number here, an inch below the first and
 * under the same word, would read as a contradiction rather than as a second
 * fact.
 *
 * This file names no kind. It reads each one's label off the registry and hands
 * it its own items — so "files changed", "tasks filed" or anything else is one
 * new sub-plugin and no edit here.
 */
export function ArtifactsPanel({
  byKind,
}: {
  byKind: ReadonlyMap<string, ArtifactItem[]>;
}) {
  return (
    <>
      {/*
        `px-md` is where the body's text starts too — the `p-xs` on the stack
        below plus the `px-sm` each band inside it pays — so the title, every
        section heading and every row glyph share one left edge. The header sits
        outside that stack, so it has to say the sum itself.
      */}
      <Line className="gap-sm border-b px-md py-xs">
        <Text variant="label" className="font-semibold">
          Artifacts
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
