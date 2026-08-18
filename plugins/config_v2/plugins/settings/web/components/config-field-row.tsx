import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  hoverRevealGroup,
  hoverRevealTarget,
} from "@plugins/primitives/plugins/hover-reveal/web";
import { useCallback, useMemo } from "react";
import { MdUndo, MdWarning } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import {
  FieldRenderer,
  ConfigFieldContext,
} from "@plugins/config_v2/plugins/fields/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import {
  Rigid,
  rigidClass,
} from "@plugins/primitives/plugins/css/plugins/rigid/web";
import type { FieldDef } from "@plugins/fields/core";
import { mapConfigLists, setConfigField } from "@plugins/config_v2/core";
import { resetConfigField } from "../../core";

// List row ids are synthesized, not authored: the live value carries an `auto-`
// id on every row while `descriptor.defaults` — the raw code default — carries
// none, at any depth. Comparing them raw would report every list-bearing config
// as modified, so both sides are stripped through the same walk first. The walk
// is `mapConfigLists`, so a nested list is stripped exactly like a top-level one
// and an objectField wrapping a list is no longer a blind spot.
function stripListIds(field: FieldDef, value: unknown): unknown {
  const { v } = mapConfigLists({ v: value }, { v: field }, (rows) =>
    rows.map((row) => {
      const { id: _id, ...rest } = row;
      return rest;
    }),
  );
  return v;
}

function isFieldModified(
  field: FieldDef,
  value: unknown,
  defaultValue: unknown,
): boolean {
  if ("itemFields" in field || "subFields" in field) {
    return (
      JSON.stringify(stripListIds(field, value)) !==
      JSON.stringify(stripListIds(field, defaultValue))
    );
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
      setField({
        body: { storePath, key: fieldKey, value: newValue, scopeId },
      });
    },
    [setField, storePath, fieldKey, scopeId],
  );

  const handleReset = useCallback(() => {
    resetField({ body: { storePath, key: fieldKey, scopeId } });
  }, [resetField, storePath, fieldKey, scopeId]);

  const handleAcceptOrigin = useCallback(() => {
    setField({
      body: { storePath, key: fieldKey, value: originValue, scopeId },
    });
  }, [setField, storePath, fieldKey, originValue, scopeId]);

  const configFieldCtxValue = useMemo(
    () => ({ storePath, fieldKey }),
    [storePath, fieldKey],
  );

  return (
    <div>
      <Stack
        direction="row"
        gap="sm"
        align="center"
        className={cn(hoverRevealGroup, "rounded-md py-xs pl-none pr-sm")}
      >
        <Rigid
          className={cn(
            "h-8 w-0.5 rounded-full transition-colors",
            hasConflict
              ? "bg-warning"
              : isModified
                ? "bg-primary"
                : "bg-transparent",
          )}
        />
        <Fill>
          <ConfigFieldContext.Provider value={configFieldCtxValue}>
            <FieldRenderer
              field={field}
              value={value}
              onChange={handleChange}
            />
          </ConfigFieldContext.Provider>
        </Fill>
        {tier && tier !== "default" && (
          <Badge
            colorClass={TIER_BADGE[tier].className}
            className={rigidClass()}
          >
            {TIER_BADGE[tier].label}
          </Badge>
        )}
        <button
          type="button"
          onClick={handleReset}
          className={cn(
            rigidClass(),
            "rounded-sm p-xs text-muted-foreground hover:text-foreground",
            isModified ? hoverRevealTarget : "pointer-events-none opacity-0",
          )}
          aria-label={`Reset ${field.meta.label ?? fieldKey}`}
        >
          <MdUndo className="size-3.5" />
        </button>
      </Stack>
      {hasConflict && (
        // The left inset indents the note under the field's value column, past
        // the accent bar and its gap. On the wrapper, not the note, so the
        // warning box's own border/background start at the indent.
        <Inset l="md">
          <Text
            as="div"
            variant="caption"
            className="rounded-md border border-warning/30 bg-warning/10 px-sm py-xs text-warning"
          >
            <Stack direction="row" gap="sm" align="center">
              <MdWarning className={cn("size-3", rigidClass())} />
              <Fill as="span" className="truncate">
                Upstream: {formatOriginValue(originValue)}
              </Fill>
              <Badge
                as="button"
                type="button"
                variant="warning"
                className={cn("hover:bg-warning/30", rigidClass())}
                onClick={handleAcceptOrigin}
              >
                Accept
              </Badge>
            </Stack>
          </Text>
        </Inset>
      )}
    </div>
  );
}
