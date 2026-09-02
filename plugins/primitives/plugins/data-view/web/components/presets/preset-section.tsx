import type { ReactNode } from "react";
import { MdDelete } from "react-icons/md";
import { ControlPanel } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";

/** One saved preset, as the panel reads it — identity, name, and its two states. */
export interface PresetEntry {
  id: string;
  label: string;
  /** The live sort/filter matches this preset exactly. */
  active: boolean;
  /** False when nothing in the preset resolves against the current schema. */
  applicable?: boolean;
}

/**
 * The saved-presets section, shared by the filter and sort panels — they were
 * twins down to their doc comments, and a preset is the same thing on both
 * sides: a name you apply.
 *
 * Applying is single-select, so the rows are `select="radio"` — the one language
 * the vocabulary has for "one of these is in force". A preset nothing in the
 * schema resolves is disabled and says why in its trailing cell, where it used to
 * say it in a `title` tooltip nobody sees.
 *
 * **Delete is the row's own action.** Hover a preset and a trash button appears
 * at its trailing edge, which is the ordinary shape for "remove this one thing"
 * and is what `ControlPanel.Row`'s `actions` slot exists for: the row box becomes
 * a plain `<div>` and the selectable region a sibling of the button, so applying
 * and deleting are two targets on one row rather than one target and a page.
 *
 * `disabled` scopes to the SELECTION there, not the row — so a preset whose
 * fields have all left the schema still cannot be applied, and can still be
 * deleted, which is exactly the pair you want.
 *
 * Deleting takes a whole filter tree with it and there is no way to reconstruct
 * one, so the way back is the caller's job: `onDelete` is expected to offer Undo
 * (the filter and sort wrappers raise a toast that restores the preset at its
 * original index).
 */
export function PresetSection({
  entries,
  onApply,
  onDelete,
}: {
  entries: PresetEntry[];
  onApply: (id: string) => void;
  onDelete: (id: string) => void;
}): ReactNode {
  if (entries.length === 0) return null;

  return (
    <ControlPanel.Section label="Presets">
      {entries.map((entry) => (
        <ControlPanel.Row
          key={entry.id}
          select="radio"
          checked={entry.active}
          disabled={entry.applicable === false}
          trailing={
            entry.applicable === false ? "No matching fields" : undefined
          }
          onSelect={() => onApply(entry.id)}
          actions={
            // The cluster supplies the xs control density, so this is a plain
            // `IconButton` with no size of its own. The label names the preset:
            // a screen reader hears one "Delete" per row otherwise.
            <IconButton
              icon={MdDelete}
              label={`Delete preset “${entry.label}”`}
              onClick={() => onDelete(entry.id)}
            />
          }
        >
          {entry.label}
        </ControlPanel.Row>
      ))}
    </ControlPanel.Section>
  );
}
