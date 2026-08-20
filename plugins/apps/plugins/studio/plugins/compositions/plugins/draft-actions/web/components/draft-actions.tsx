import type { ReactElement } from "react";
import { MdDeleteOutline, MdSave } from "react-icons/md";
import {
  Button,
  Input,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
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
import { useDeleteComposition } from "@plugins/build/plugins/serve-composition/web";
import { MAIN_COMPOSITION_ID } from "@plugins/infra/plugins/namespace/core";

/**
 * Persistence actions for the active draft: an inline editable name plus Save /
 * Delete / Clear. The pane's `:id` is the composition being edited, so Save is
 * always an in-place update.
 *
 * Delete is available for every composition except the one the repo itself
 * builds — that entry must exist, so the button is simply absent there (the
 * config edit underneath throws on it). It removes the row AND what the composition is serving: the
 * same `useDeleteComposition` the list row's Delete calls, so the two paths
 * cannot drift. The button pends while the server says what is at stake, then a
 * confirm dialog names every address and database that will go; only once they
 * are actually reclaimed does the draft clear and the pane close.
 *
 * Save stays available: editing main's entry points is legitimate, and a
 * narrowing edit is caught loudly by the registry-equivalence check on the next
 * build.
 */
export function DraftActions({ id }: { id: string }): ReactElement {
  const draft = useActiveComposition();
  const { save } = useManifestActions();
  const { deleteComposition } = useDeleteComposition();
  // Null only for a root pane; `compositionDetailPane` always has ancestors, so
  // the fallback is there to make the expression total.
  const close =
    compositionDetailPane.useClose() ??
    (() => openPane(compositionsPane, {}, { mode: "root" }));

  // The seed effect populates the store one frame after mount; Loading's built-in
  // delay means that gap never flashes.
  if (!draft) return <Loading variant="text" />;

  const canSave = draft.name.trim().length > 0;
  // The draft's name is what the person is looking at while they edit; an unsaved
  // rename is still how they think of this composition, so it is what the delete
  // dialog names.
  const draftName = draft.name;

  // Returned to the Button so it auto-pends for the inventory read; the dialog
  // owns everything after that, and the draft is only cleared once the row is
  // genuinely gone (never on cancel, never on a failed reclaim).
  function onDelete(): Promise<void> {
    return deleteComposition({
      id,
      name: draftName,
      onDeleted: () => {
        clearActive();
        close();
      },
    });
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
        <Button
          variant="default"
          disabled={!canSave}
          onClick={() => save(draft, id)}
        >
          <MdSave />
          Save
        </Button>
        {id !== MAIN_COMPOSITION_ID && (
          <Button variant="ghost" onClick={onDelete}>
            <MdDeleteOutline />
            Delete
          </Button>
        )}
        <Button variant="ghost" onClick={() => clearActive()}>
          Clear
        </Button>
      </Stack>
    </Stack>
  );
}
