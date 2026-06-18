import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useCallback } from "react";
import { MdUndo, MdWarning } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { FieldRenderer, ConfigFieldContext } from "@plugins/config_v2/plugins/fields/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { FieldDef } from "@plugins/fields/core";
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
  git: { label: "git", className: "bg-info/10 text-info" },
  user: { label: "user", className: "bg-primary/10 text-primary" },
} as const;

export function ConfigFieldRow({
  fieldKey,
  field,
  value,
  defaultValue,
  storePath,
  scopeId,
  originValue,
  trueConflictKeys,
  tier,
}: {
  fieldKey: string;
  field: FieldDef;
  value: unknown;
  defaultValue: unknown;
  storePath: string;
  scopeId?: string;
  originValue?: unknown;
  trueConflictKeys?: string[];
  tier?: "default" | "git" | "user";
}) {
  const isModified = isFieldModified(field, value, defaultValue);
  // When a three-way merge is available (trueConflictKeys present), only the
  // fields both sides changed differently are flagged — a field the user changed
  // but upstream didn't is a legitimate keep, not a conflict. Without an ancestor
  // (legacy/binary path) fall back to the naive value-vs-origin comparison.
  const hasConflict =
    trueConflictKeys !== undefined
      ? trueConflictKeys.includes(fieldKey)
      : originValue !== undefined &&
        JSON.stringify(value) !== JSON.stringify(originValue);

  // useEndpointMutation (not void fetchEndpoint) so a failed save/reset surfaces
  // via the global error toast instead of escaping as an unhandled rejection.
  const { mutate: setField } = useEndpointMutation(setConfigField);
  const { mutate: resetField } = useEndpointMutation(resetConfigField);

  const handleChange = useCallback(
    (newValue: unknown) => {
      setField({ body: { storePath, key: fieldKey, value: newValue, scopeId } });
    },
    [setField, storePath, fieldKey, scopeId],
  );

  const handleReset = useCallback(() => {
    resetField({ body: { storePath, key: fieldKey, scopeId } });
  }, [resetField, storePath, fieldKey, scopeId]);

  const handleAcceptOrigin = useCallback(() => {
    setField({ body: { storePath, key: fieldKey, value: originValue, scopeId } });
  }, [setField, storePath, fieldKey, originValue, scopeId]);

  return (
    <div>
      <div className="group flex items-center gap-sm rounded-md py-xs pl-none pr-sm">
        <div
          className={cn(
            "h-8 w-0.5 shrink-0 rounded-full transition-colors",
            hasConflict ? "bg-warning" : isModified ? "bg-primary" : "bg-transparent",
          )}
        />
        <div className="min-w-0 flex-1">
          <ConfigFieldContext.Provider value={{ storePath, fieldKey }}>
            <FieldRenderer field={field} value={value} onChange={handleChange} />
          </ConfigFieldContext.Provider>
        </div>
        {tier && tier !== "default" && (
          <Badge size="sm" colorClass={TIER_BADGE[tier].className} className="shrink-0">
            {TIER_BADGE[tier].label}
          </Badge>
        )}
        <button
          type="button"
          onClick={handleReset}
          className={cn(
            "shrink-0 rounded-sm p-xs text-muted-foreground hover:text-foreground",
            "opacity-0 transition-opacity",
            isModified && "group-hover:opacity-100",
          )}
          aria-label={`Reset ${field.meta.label ?? fieldKey}`}
        >
          <MdUndo className="size-3.5" />
        </button>
      </div>
      {hasConflict && (
        // eslint-disable-next-line spacing/no-adhoc-spacing -- ml-3 indents the conflict note under the field's value column
        <Text as="div" variant="caption" className="ml-3 flex items-center gap-sm rounded-md border border-warning/30 bg-warning/10 px-sm py-xs text-warning">
          <MdWarning className="size-3 shrink-0" />
          <span className="flex-1 truncate">
            Upstream: {formatOriginValue(originValue)}
          </span>
          <Badge
            as="button"
            type="button"
            variant="warning"
            size="sm"
            className="shrink-0 hover:bg-warning/30"
            onClick={handleAcceptOrigin}
          >
            Accept
          </Badge>
        </Text>
      )}
    </div>
  );
}
