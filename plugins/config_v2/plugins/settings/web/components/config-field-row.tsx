import { useCallback } from "react";
import { MdUndo } from "react-icons/md";
import { cn } from "@/lib/utils";
import { FieldRenderer } from "@plugins/config_v2/plugins/fields/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import type { FieldDef } from "@plugins/config_v2/core";
import { setConfigField, resetConfigField } from "../../core";

function isFieldModified(field: FieldDef, value: unknown, defaultValue: unknown): boolean {
  if ("itemFields" in field && Array.isArray(value) && Array.isArray(defaultValue)) {
    const strip = (arr: unknown[]) =>
      arr.map((item) => {
        if (!item || typeof item !== "object") return item;
        const { id: _id, rank: _rank, ...rest } = item as Record<string, unknown>;
        return rest;
      });
    return JSON.stringify(strip(value)) !== JSON.stringify(strip(defaultValue));
  }
  return value !== defaultValue;
}

export function ConfigFieldRow({
  fieldKey,
  field,
  value,
  defaultValue,
  storePath,
}: {
  fieldKey: string;
  field: FieldDef;
  value: unknown;
  defaultValue: unknown;
  storePath: string;
}) {
  const isModified = isFieldModified(field, value, defaultValue);

  const handleChange = useCallback(
    (newValue: unknown) => {
      void fetchEndpoint(setConfigField, {}, { body: { storePath, key: fieldKey, value: newValue } });
    },
    [storePath, fieldKey],
  );

  const handleReset = useCallback(() => {
    void fetchEndpoint(resetConfigField, {}, { body: { storePath, key: fieldKey } });
  }, [storePath, fieldKey]);

  return (
    <div className="group flex items-center gap-2 rounded-md py-1.5 pl-0 pr-2">
      <div
        className={cn(
          "h-8 w-0.5 shrink-0 rounded-full transition-colors",
          isModified ? "bg-primary" : "bg-transparent",
        )}
      />
      <div className="min-w-0 flex-1">
        <FieldRenderer field={field} value={value} onChange={handleChange} />
      </div>
      <button
        type="button"
        onClick={handleReset}
        className={cn(
          "shrink-0 rounded-sm p-1 text-muted-foreground hover:text-foreground",
          "opacity-0 transition-opacity",
          isModified && "group-hover:opacity-100",
        )}
        aria-label={`Reset ${field.meta.label ?? fieldKey}`}
      >
        <MdUndo className="size-3.5" />
      </button>
    </div>
  );
}
