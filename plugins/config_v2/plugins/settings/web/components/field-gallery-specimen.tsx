import { useMemo, useState } from "react";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import {
  ConfigFieldAdornmentsProvider,
  FieldRenderer,
  type ConfigFieldAdornments,
} from "@plugins/config_v2/plugins/fields/web";
import type { FieldDef } from "@plugins/fields/core";
import { ControlPanelPane } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { SpecimenProps } from "@plugins/plugin-meta/plugins/specimens/web";

// The settings pane always supplies an adornments object (see ConfigField), and
// its presence decides which panel member a field renders as — so the gallery
// supplies one too, empty, to render each field exactly as an unmodified row.
const NO_ADORNMENTS: ConfigFieldAdornments = {};

interface Sample {
  key: string;
  field: FieldDef;
  value: unknown;
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/**
 * Every config field type, as the settings pane renders it (a specimen): one
 * row per field type, each a REAL field of a registered config — the first one
 * whose default is not empty, so a list shows items and a text shows text —
 * relabelled `<type> · <label>` so a mock beside it can be read row by row.
 *
 * Generic over the open set of field types: it samples whatever the registered
 * configs declare and names no field type, so adding a type adds a row.
 *
 * An exhibit, not a working copy: edits land in local state only, and no
 * ConfigFieldContext is supplied, so no renderer reaches a stored value.
 */
export function FieldGallerySpecimen(_props: SpecimenProps) {
  const registrations = useConfigRegistrations();
  const samples = useMemo(() => {
    const byType = new Map<string, Sample>();
    const sorted = [...registrations].sort((a, b) =>
      a.storePath.localeCompare(b.storePath),
    );
    for (const reg of sorted) {
      for (const [key, field] of Object.entries(reg.descriptor.fields)) {
        const value: unknown = field.defaultValue;
        const typeId = field.type.id;
        const prev = byType.get(typeId);
        if (prev && !(isEmptyValue(prev.value) && !isEmptyValue(value))) {
          continue;
        }
        byType.set(typeId, {
          key: `${reg.storePath}:${key}`,
          field: {
            ...field,
            meta: {
              ...field.meta,
              label: `${typeId} · ${field.meta.label ?? key}`,
            },
          },
          value,
        });
      }
    }
    return [...byType.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, sample]) => sample);
  }, [registrations]);

  return (
    <Stack gap="xs" className="p-md">
      <ConfigFieldAdornmentsProvider value={NO_ADORNMENTS}>
        <ControlPanelPane>
          {samples.map((sample) => (
            <SampleField key={sample.key} sample={sample} />
          ))}
        </ControlPanelPane>
      </ConfigFieldAdornmentsProvider>
    </Stack>
  );
}

function SampleField({ sample }: { sample: Sample }) {
  const [value, setValue] = useState<unknown>(sample.value);
  return (
    <FieldRenderer field={sample.field} value={value} onChange={setValue} />
  );
}
