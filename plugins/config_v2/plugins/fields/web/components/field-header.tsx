import type { FieldDef } from "@plugins/config_v2/core";

export function FieldHeader({ field }: { field: FieldDef }) {
  return (
    <div className="flex flex-col gap-0.5">
      {field.meta.label ? (
        <label className="text-sm font-medium">{field.meta.label}</label>
      ) : null}
      {field.meta.description ? (
        <p className="text-xs text-muted-foreground">
          {field.meta.description}
        </p>
      ) : null}
    </div>
  );
}
