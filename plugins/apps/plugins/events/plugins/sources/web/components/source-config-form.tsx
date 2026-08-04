import type { ReactElement } from "react";
import { FieldRenderer } from "@plugins/config_v2/plugins/fields/web";
import type { FieldsRecord } from "@plugins/fields/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export interface SourceConfigFormProps {
  /** The source type's own `configFields`, verbatim. */
  fields: FieldsRecord;
  /** Current value per field key (already resolved by `readConfigValues`). */
  values: Record<string, unknown>;
  /** Called with ONE key's new value; the caller owns merging + persistence. */
  onChange: (key: string, value: unknown) => void;
  /** Shown when the record is empty. Zero config is a legitimate type. */
  emptyLabel?: string;
}

/**
 * The whole add/configure form for ANY source type, rendered from its
 * `FieldsRecord` through the same `FieldRenderer` dispatch `config_v2`'s
 * settings pane uses.
 *
 * This file is the payoff of the design and the reason it must stay generic: a
 * new source type ships a `core/` field record and a `server/` extractor, and
 * gets a working form for free. There is no per-type branch here and there must
 * never be one — the moment this file names a type id, the marketplace promise
 * ("publish a source type, it drops into everyone's Events app") is gone. A type
 * that genuinely needs bespoke chrome contributes `Extra` instead.
 *
 * Each renderer owns its own commit granularity (the text renderer commits on
 * blur, not per keystroke), so `onChange` fires at field-edit frequency and is
 * safe to wire straight to an autosave PATCH.
 */
export function SourceConfigForm({
  fields,
  values,
  onChange,
  emptyLabel = "This source type has nothing to configure.",
}: SourceConfigFormProps): ReactElement {
  const entries = Object.entries(fields);

  if (entries.length === 0) {
    return (
      <Text as="p" variant="body" tone="muted">
        {emptyLabel}
      </Text>
    );
  }

  return (
    <Stack gap="none">
      {entries.map(([key, field]) => (
        <FieldRenderer
          key={key}
          field={field}
          value={values[key]}
          onChange={(value) => onChange(key, value)}
        />
      ))}
    </Stack>
  );
}
