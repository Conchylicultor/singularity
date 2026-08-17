import type { ReactNode } from "react";
import { MdDelete } from "react-icons/md";
import {
  ControlPanel,
  usePanelStack,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";

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
 * **Delete is its own page.** A panel row's trailing cell is presentational by
 * contract (the row itself is the click target, so a delete button in it would be
 * a button inside a button), and apply belongs on the row — it is the thing you
 * came here to do. So the destructive verb moves one row down and one level in,
 * which is also where a rarely-used, irreversible action belongs.
 *
 * `deletePanel` is a factory rather than the entries again because the pushed
 * page must read the presets LIVE: a panel-stack entry's `render` closure is
 * captured when it is pushed, so a list handed in here would still show a preset
 * the user just deleted.
 */
export function PresetSection({
  entries,
  onApply,
  deletePanel,
}: {
  entries: PresetEntry[];
  onApply: (id: string) => void;
  deletePanel: () => ReactNode;
}): ReactNode {
  const { push } = usePanelStack();
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
        >
          {entry.label}
        </ControlPanel.Row>
      ))}
      <ControlPanel.Row
        icon={<MdDelete />}
        muted
        onSelect={() =>
          push({
            key: "delete-preset",
            title: "Delete a preset",
            render: deletePanel,
          })
        }
      >
        Delete a preset…
      </ControlPanel.Row>
    </ControlPanel.Section>
  );
}

/**
 * The pushed delete page: one danger row per preset, deleting on click.
 *
 * It does not pop after a delete — the list is live, so the row simply leaves and
 * the user can drop a second one without walking back in. When the last preset
 * goes the page says so rather than emptying into nothing.
 */
export function PresetDeletePanel({
  entries,
  onDelete,
}: {
  entries: PresetEntry[];
  onDelete: (id: string) => void;
}): ReactNode {
  return (
    <ControlPanel.Section>
      {entries.length === 0 ? (
        <ControlPanel.Empty>No presets left.</ControlPanel.Empty>
      ) : (
        entries.map((entry) => (
          <ControlPanel.Row
            key={entry.id}
            icon={<MdDelete />}
            tone="danger"
            onSelect={() => onDelete(entry.id)}
          >
            {entry.label}
          </ControlPanel.Row>
        ))
      )}
    </ControlPanel.Section>
  );
}
