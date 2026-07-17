import type { ReactElement } from "react";
import { MdDeleteOutline, MdSave } from "react-icons/md";
import { Button, Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { openPane } from "@plugins/primitives/plugins/pane/web";
import {
  compositionsPane,
  compositionDetailPane,
} from "@plugins/apps/plugins/studio/plugins/compositions/web";
import {
  useActiveComposition,
  useManifestActions,
  updateActiveDraft,
  clearActive,
} from "@plugins/plugin-meta/plugins/composition/web";

/**
 * Persistence actions for the active draft: an inline editable name plus Save /
 * Delete / Clear. The pane's `:id` is the composition being edited, so Save is
 * always an in-place update and Delete is always available.
 */
export function DraftActions({ id }: { id: string }): ReactElement {
  const draft = useActiveComposition();
  const { save, remove } = useManifestActions();
  // Null only for a root pane; `compositionDetailPane` always has ancestors, so
  // the fallback is there to make the expression total.
  const close =
    compositionDetailPane.useClose() ??
    (() => openPane(compositionsPane, {}, { mode: "root" }));

  // The seed effect populates the store one frame after mount; Loading's built-in
  // delay means that gap never flashes.
  if (!draft) return <Loading variant="text" />;

  const canSave = draft.name.trim().length > 0;

  function onDelete(): void {
    remove(id);
    clearActive();
    close();
  }

  return (
    <Stack gap="sm">
      <Input
        value={draft.name}
        onChange={(e) => updateActiveDraft({ name: e.target.value })}
        placeholder="Composition name"
        aria-label="Composition name"
      />
      <Stack direction="row" align="center" gap="xs">
        <Button variant="default" disabled={!canSave} onClick={() => save(draft, id)}>
          <MdSave />
          Save
        </Button>
        <Button variant="ghost" onClick={onDelete}>
          <MdDeleteOutline />
          Delete
        </Button>
        <Button variant="ghost" onClick={() => clearActive()}>
          Clear
        </Button>
      </Stack>
    </Stack>
  );
}
