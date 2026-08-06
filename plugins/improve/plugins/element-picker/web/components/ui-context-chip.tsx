import type { ReactNode } from "react";
import { MdAdsClick } from "react-icons/md";
import {
  UI_CONTEXT_FIELDS,
  type UiContextField,
  type UiContextMeta,
} from "@plugins/primitives/plugins/ui-context/core";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { LineagePath } from "./lineage-path";

/**
 * Fields whose value is structured enough that a flat string misrepresents it.
 * The popover's row loop still iterates UI_CONTEXT_FIELDS — this only swaps how
 * ONE field's value is drawn, so a field can still never be silently dropped,
 * and a field with no entry here falls back to plain text.
 */
const FIELD_BODY: Partial<Record<UiContextField["key"], (v: string) => ReactNode>> =
  {
    path: (v) => <LineagePath path={v} />,
  };

/**
 * A single detail row: right-aligned label, value cell. EVERY field uses it,
 * including the structured ones — the shared label column is what makes the
 * popover scannable, so a field that opts out of the grid to claim full width
 * reads as messier than the flat string it replaced.
 */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack as="div" direction="row" gap="sm" align="baseline">
      <Text
        as="span"
        variant="caption"
        tone="muted"
        // Wide enough for the longest registered label ("Contribution"), which
        // otherwise overflows its column and runs into the value.
        className="w-20 shrink-0 text-right"
      >
        {label}
      </Text>
      <div className="min-w-0 flex-1">{children}</div>
    </Stack>
  );
}

/** The compact inline chip representing a captured UI element. Clicking it opens
 * a popover with the full captured metadata. */
export function UiContextChip({ meta }: { meta: UiContextMeta }) {
  const trigger = (
    <Inset
      as="button"
      x="xs"
      y="2xs"
      contentEditable={false}
      className="bg-muted border-border text-foreground hover:bg-accent inline-flex max-w-40 cursor-pointer rounded-md border align-middle transition-colors"
    >
      <Stack as="span" direction="row" gap="2xs" align="center" className="min-w-0">
        <MdAdsClick className="text-muted-foreground size-3.5 shrink-0" />
        <Text as="span" variant="label" className="min-w-0 truncate">
          {meta.element}
        </Text>
      </Stack>
    </Inset>
  );

  return (
    <InlinePopover trigger={trigger} width="2xl" tooltip="UI element context">
      <Inset pad="sm">
        <Stack gap="sm">
          <Stack direction="row" gap="2xs" align="center" className="min-w-0">
            <MdAdsClick className="text-muted-foreground size-4 shrink-0" />
            <Text as="span" variant="label" className="min-w-0 break-all">
              {meta.element}
            </Text>
          </Stack>
          <Stack gap="2xs">
            {/* Every field is rendered straight from the shared registry, so the
                popover can never silently drop a field the tag carries — adding a
                field to UI_CONTEXT_FIELDS surfaces it here automatically. */}
            {UI_CONTEXT_FIELDS.map((f) => {
              const value = meta[f.key];
              if (!value) return null;
              const body = FIELD_BODY[f.key];
              return (
                <DetailRow key={f.key} label={f.label}>
                  {body ? (
                    body(value)
                  ) : (
                    <Text as="span" variant="caption" className="break-all">
                      {value}
                    </Text>
                  )}
                </DetailRow>
              );
            })}
          </Stack>
        </Stack>
      </Inset>
    </InlinePopover>
  );
}
