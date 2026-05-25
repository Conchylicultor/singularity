import { useCallback } from "react";
import { MdUndo, MdWarning } from "react-icons/md";
import { cn } from "@/lib/utils";
import { FieldRenderer, ConfigFieldContext } from "@plugins/config_v2/plugins/fields/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import type { FieldDef } from "@plugins/config_v2/core";
import { setConfigField } from "@plugins/config_v2/core";
import { resetConfigField } from "../../core";

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
  if ("subFields" in field && typeof value === "object" && typeof defaultValue === "object") {
    return JSON.stringify(value) !== JSON.stringify(defaultValue);
  }
  return value !== defaultValue;
}

function formatOriginValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

const TIER_BADGE = {
  git: { label: "git", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  user: { label: "user", className: "bg-primary/10 text-primary" },
} as const;

export function ConfigFieldRow({
  fieldKey,
  field,
  value,
  defaultValue,
  storePath,
  originValue,
  tier,
}: {
  fieldKey: string;
  field: FieldDef;
  value: unknown;
  defaultValue: unknown;
  storePath: string;
  originValue?: unknown;
  tier?: "default" | "git" | "user";
}) {
  const isModified = isFieldModified(field, value, defaultValue);
  const hasConflict =
    originValue !== undefined &&
    JSON.stringify(value) !== JSON.stringify(originValue);

  const handleChange = useCallback(
    (newValue: unknown) => {
      void fetchEndpoint(setConfigField, {}, { body: { storePath, key: fieldKey, value: newValue } });
    },
    [storePath, fieldKey],
  );

  const handleReset = useCallback(() => {
    void fetchEndpoint(resetConfigField, {}, { body: { storePath, key: fieldKey } });
  }, [storePath, fieldKey]);

  const handleAcceptOrigin = useCallback(() => {
    void fetchEndpoint(setConfigField, {}, { body: { storePath, key: fieldKey, value: originValue } });
  }, [storePath, fieldKey, originValue]);

  return (
    <div>
      <div className="group flex items-center gap-2 rounded-md py-1.5 pl-0 pr-2">
        <div
          className={cn(
            "h-8 w-0.5 shrink-0 rounded-full transition-colors",
            hasConflict ? "bg-amber-500" : isModified ? "bg-primary" : "bg-transparent",
          )}
        />
        <div className="min-w-0 flex-1">
          <ConfigFieldContext.Provider value={{ storePath, fieldKey }}>
            <FieldRenderer field={field} value={value} onChange={handleChange} />
          </ConfigFieldContext.Provider>
        </div>
        {tier && tier !== "default" && (
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium",
              TIER_BADGE[tier].className,
            )}
          >
            {TIER_BADGE[tier].label}
          </span>
        )}
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
      {hasConflict && (
        <div className="ml-3 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
          <MdWarning className="size-3 shrink-0" />
          <span className="flex-1 truncate">
            Upstream: {formatOriginValue(originValue)}
          </span>
          <button
            type="button"
            onClick={handleAcceptOrigin}
            className="shrink-0 rounded-sm bg-amber-500/20 px-1.5 py-0.5 font-medium hover:bg-amber-500/30"
          >
            Accept
          </button>
        </div>
      )}
    </div>
  );
}
