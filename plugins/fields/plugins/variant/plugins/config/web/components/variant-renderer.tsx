import type { FieldsRecord } from "@plugins/fields/core";
import { defineFieldShape } from "@plugins/config_v2/plugins/fields/web";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import {
  variantFieldType,
  type VariantValue,
} from "@plugins/fields/plugins/variant/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useMemo } from "react";
import type { VariantFieldDef } from "../../core";

/**
 * A type-dispatched field: the discriminant plus the selected type's payload.
 *
 * It is a `group` WHOSE FIRST FIELD IS THE DISCRIMINANT — an ordinary
 * `enumField` built here from the registry — rather than a hand-drawn `Select`
 * beside a hand-drawn sub-form. So the type picker gets exactly the treatment
 * every other closed choice in the app gets (rows in the panel's radio language,
 * or a picker past the threshold), the payload recurses through the dispatch,
 * and this file draws nothing.
 */
const VariantRenderer = defineFieldShape({
  type: variantFieldType,
  useShape: ({ field, value, onChange }) => {
    // `useVariants` is a fixed property of a frozen field def, so this call is
    // unconditional for any given field even though the property is optional.
    const variants = (field as VariantFieldDef).useVariants?.();
    const entry = variants?.get(value.type);

    const fields = useMemo<FieldsRecord | null>(() => {
      if (!variants || variants.size === 0) return null;
      return {
        type: enumField({
          label: "Type",
          options: Array.from(variants.entries()).map(([type, e]) => ({
            value: type,
            label: e.label,
          })),
          default: value.type,
        }),
        ...(entry?.fields ?? {}),
      };
    }, [variants, entry, value.type]);

    if (!fields) {
      // No registry in this render context — degrade to a read-only display of
      // the stored discriminant rather than crashing or inventing a picker.
      return {
        kind: "value",
        fit: "inline",
        control: (
          <Text variant="body" tone="muted" className="font-mono">
            {value.type || "(no type)"}
          </Text>
        ),
      };
    }

    return {
      kind: "group",
      fields,
      values: value,
      onChangeField: (key, next) =>
        // Switching the discriminant DROPS the old payload: the keys belonged to
        // the previous type's schema and mean nothing under the new one.
        key === "type"
          ? onChange({ type: String(next) })
          : onChange({ ...value, [key]: next } as VariantValue),
    };
  },
});

export { VariantRenderer };
