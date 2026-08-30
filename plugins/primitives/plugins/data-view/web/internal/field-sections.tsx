import { Fragment, type ReactNode } from "react";
import { ControlPanel } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import {
  splitFieldSections,
  type FieldDef,
  type FieldSchemaSection,
} from "../../core";

/**
 * Draw a field list band by band — the ONE place that decides a schema is worth
 * titling.
 *
 * Every "choose a field" surface goes through it (the filter/sort typeahead, the
 * Properties list, the group-by radio band), so the merged run schema reads as
 * `Common / Build / Backup / Deploy` in all of them, and a plain one-plugin
 * schema keeps the flat list it always had: with a single section there is
 * nothing to tell apart, and one heading over the whole list only costs a line.
 *
 * The heading is `ControlPanel.Subhead` — the panel vocabulary's own member, so
 * it follows the panel's label rails and typography rather than being hand-rolled
 * here. It carries no rail class of its own, which is what makes it right in the
 * one surface with no panel around it: the bare `InlinePopover` in
 * `web/components/filter/field-picker.tsx`, where it lands on that region's
 * content edge instead.
 *
 * `children` renders one band's rows — whatever vocabulary the surface is drawn
 * in (a `Row`, a `ControlPanel.Row`, a `SortableList` of them).
 */
export function FieldSections<TRow>(props: {
  fields: FieldDef<TRow>[];
  children: (
    fields: FieldDef<TRow>[],
    section: FieldSchemaSection<TRow>,
  ) => ReactNode;
}): ReactNode {
  const sections = splitFieldSections(props.fields);
  const titled = sections.length > 1;
  return (
    <>
      {sections.map((section) => (
        <Fragment key={section.id ?? "__base__"}>
          {titled ? (
            <ControlPanel.Subhead>{section.label}</ControlPanel.Subhead>
          ) : null}
          {props.children(section.fields, section)}
        </Fragment>
      ))}
    </>
  );
}

/**
 * What a field's own section adds to the text a typeahead matches against —
 * so typing "deploy" in the filter picker offers the deploy arm's columns, not
 * only the fields with "deploy" in their name.
 */
export function fieldSearchText<TRow>(field: FieldDef<TRow>): string {
  return field.section ? `${field.section} ${field.label}` : field.label;
}
