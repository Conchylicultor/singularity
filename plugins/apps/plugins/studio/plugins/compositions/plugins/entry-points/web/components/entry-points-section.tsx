import type { ReactElement } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  useActiveComposition,
  useCompositionData,
} from "@plugins/plugin-meta/plugins/composition/web";
import { isCommittedSourceComposition } from "@plugins/plugin-meta/plugins/composition/core";
import { EntryEditor } from "./entry-editor";

/** Section host for the entry-point editor. */
export function EntryPointsSection({ id }: { id: string }): ReactElement {
  const draft = useActiveComposition();
  const { allIds } = useCompositionData();

  if (!draft) {
    return (
      <Text variant="caption" tone="muted">
        No active composition.
      </Text>
    );
  }

  // Main's row and the `base-exclusions` row are the two whose entry points
  // decide what the app SHIPS, and codegen reads them from the committed config
  // — so an edit stored here could never reach a registry. The same predicate
  // the `save` guard uses, so the inert control and the throw beneath it cannot
  // disagree about which rows they mean.
  return (
    <EntryEditor
      draft={draft}
      allIds={allIds}
      editable={!isCommittedSourceComposition(id)}
    />
  );
}
