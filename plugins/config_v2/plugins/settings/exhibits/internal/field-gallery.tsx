import { useState } from "react";
import {
  ConfigFieldAdornmentsProvider,
  FieldRenderer,
  useFieldSamples,
  type ConfigFieldAdornments,
  type FieldSampleEntry,
} from "@plugins/config_v2/plugins/fields/web";
import type { FieldDef } from "@plugins/fields/core";
import { ControlPanelPane } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

// The settings pane always supplies an adornments object (see ConfigField), and
// its presence decides which panel member a field renders as — so the gallery
// supplies one too, empty, to render each field exactly as an unmodified row.
const NO_ADORNMENTS: ConfigFieldAdornments = {};

/**
 * Every config field type, as the settings pane renders it (the `config/field-gallery` exhibit): one
 * row per field type, sorted by type id, each the type's own fixed sample
 * (`Fields.Sample` — a field built with that type's factory, with a fixed
 * label, description and value). Fixed rather than sampled from registered
 * configs, so the rows are the same on every machine and a hand-written mock
 * can mirror them one for one.
 *
 * Generic over the open set of field types: it reads `useFieldSamples` and
 * names no field type, so adding a type (with its sample) adds a row. A type
 * with a renderer but no sample shows as a placeholder row.
 *
 * An exhibit, not a working copy: edits land in local state only, and no
 * ConfigFieldContext is supplied, so no renderer reaches a stored value.
 */
export default function FieldGalleryExhibit() {
  const entries = useFieldSamples();
  return (
    <Stack gap="xs" className="p-md">
      <ConfigFieldAdornmentsProvider value={NO_ADORNMENTS}>
        <ControlPanelPane>
          {entries.map((entry) => (
            <SampleField key={entry.typeId} entry={entry} />
          ))}
        </ControlPanelPane>
      </ConfigFieldAdornmentsProvider>
    </Stack>
  );
}

function SampleField({ entry }: { entry: FieldSampleEntry }) {
  if (entry.kind === "missing") {
    return (
      <Placeholder>No Fields.Sample for field type: {entry.typeId}</Placeholder>
    );
  }
  return <SampleRow field={entry.sample.field} initial={entry.sample.value} />;
}

function SampleRow({ field, initial }: { field: FieldDef; initial: unknown }) {
  const [value, setValue] = useState<unknown>(initial);
  return <FieldRenderer field={field} value={value} onChange={setValue} />;
}
