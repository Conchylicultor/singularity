import type { FieldMeta } from "@plugins/config_v2/core";

export function pickMeta(opts?: FieldMeta): FieldMeta {
  return {
    label: opts?.label,
    description: opts?.description,
    placeholder: opts?.placeholder,
  };
}
