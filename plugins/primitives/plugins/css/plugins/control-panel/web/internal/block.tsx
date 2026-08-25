import type React from "react";

import {
  SettingDescription,
  SettingNote,
  SettingRow,
  type ControlPanelMark,
} from "./setting-row";

export interface ControlPanelBlockProps {
  label: React.ReactNode;
  hint?: string;
  /** Muted line under the label, above the control. Visible, not a tooltip. */
  description?: React.ReactNode;
  /** The control. Lands on the panel's rail by doing nothing. */
  children: React.ReactNode;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  mark?: ControlPanelMark;
  note?: React.ReactNode;
  className?: string;
}

/**
 * A CONTROL WIDER THAN A ROW — a textarea, a code box, a chip cluster, a drag
 * editor — with the label that names it.
 *
 * "Loose content lands on the rail by doing nothing" is true and it is not
 * enough, because somebody still has to draw the label; if that somebody is a
 * field renderer, every renderer draws its own and the vocabulary is back where
 * it started. This is the member that carries it.
 *
 * `Block` is deliberately NOT a `Section`: it carries no `cp-band`, so a run of
 * blocks is one visual group with no hairline between them — the same reason
 * `RuleList` and `Empty` are not bands.
 *
 * ITS LABEL IS A FIELD LABEL, so it is drawn in a row's label cell — on the TEXT
 * rail, not on the panel's content edge. Invariant #1 says every LABEL starts at
 * one x, and a Block label sits at the same rung as a Setting label and a Row
 * label. A `Section` label is an eyebrow, a different rung, and keeps the
 * panel's content edge. In a panel with no icon track the two coincide; in one
 * with icons the eyebrow hangs back by design. Gated by the `block-label-rail`
 * fixture rather than by this paragraph, because it is exactly the kind of thing
 * that drifts silently.
 */
export function ControlPanelBlock({
  label,
  hint,
  description,
  children,
  status,
  actions,
  mark,
  note,
  className,
}: ControlPanelBlockProps) {
  return (
    <>
      <SettingRow
        label={label}
        hint={hint}
        status={status}
        actions={actions}
        mark={mark}
        className={className}
      />
      {description != null ? (
        <SettingDescription>{description}</SettingDescription>
      ) : null}
      {children}
      {note != null ? <SettingNote>{note}</SettingNote> : null}
    </>
  );
}
