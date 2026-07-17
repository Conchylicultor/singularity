import type { ReactElement } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  useActiveComposition,
  useCompositionData,
} from "@plugins/plugin-meta/plugins/composition/web";
import { EntryEditor } from "./entry-editor";

/** Section host for the entry-point editor. */
export function EntryPointsSection(): ReactElement {
  const draft = useActiveComposition();
  const { allIds } = useCompositionData();

  if (!draft) {
    return (
      <Text variant="caption" tone="muted">
        No active composition.
      </Text>
    );
  }

  return <EntryEditor draft={draft} allIds={allIds} />;
}
