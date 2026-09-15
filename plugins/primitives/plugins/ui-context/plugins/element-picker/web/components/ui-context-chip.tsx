import type { ReactNode } from "react";
import { MdAdsClick } from "react-icons/md";
import {
  UI_CONTEXT_FIELDS,
  type UiContextField,
  type UiContextMeta,
} from "@plugins/primitives/plugins/ui-context/core";
import {
  Fill,
  fillClasses,
} from "@plugins/primitives/plugins/css/plugins/fill/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { InlinePopover } from "@plugins/primitives/plugins/overlay/plugins/popover/web";
import { LineagePath } from "./lineage-path";

/**
 * Fields whose value is structured enough that a flat string misrepresents it.
 * The popover's row loop still iterates UI_CONTEXT_FIELDS — this only swaps how
 * ONE field's value is drawn, so a field can still never be silently dropped,
 * and a field with no entry here falls back to plain text.
 */
const FIELD_BODY: Partial<
  Record<UiContextField["key"], (v: string) => ReactNode>
> = {
  path: (v) => <LineagePath path={v} />,
};

/**
 * A single detail row: right-aligned label, value cell. EVERY field uses it,
 * including the structured ones — the shared label column is what makes the
 * popover scannable, so a field that opts out of the grid to claim full width
 * reads as messier than the flat string it replaced.
 */
function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Stack as="div" direction="row" gap="sm" align="baseline">
      <Text
        as="span"
        variant="caption"
        tone="muted"
        // Wide enough for the longest registered label ("Contribution"), which
        // otherwise overflows its column and runs into the value.
        className={cn(rigidClass(), "w-20 text-right")}
      >
        {label}
      </Text>
      <Fill>{children}</Fill>
    </Stack>
  );
}

/** The compact inline chip representing a captured UI element. Clicking it opens
 * a popover with the full captured metadata. */
export function UiContextChip({ meta }: { meta: UiContextMeta }) {
  // The SAME chip every other inline token renders as. This one used to build
  // its own shell, and it was the better-looking of the two — so rather than
  // restyle it into the family, the family moved to it: the outlined tile that
  // was local to this file is now what `LinkChip` paints for every inline chip.
  //
  // No `onClick`: the popover clones this element with the handler that opens
  // the panel (see `LinkChipProps.onClick`). `max-w-40` is the one thing it does
  // not share — an element label is an arbitrary selector-ish string, so it is
  // capped and ellipsized by Badge's own truncating label span.
  const trigger = (
    <LinkChip
      contentEditable={false}
      className="max-w-40"
      leading={
        <MdAdsClick className={cn("text-muted-foreground", rigidClass())} />
      }
    >
      {meta.element}
    </LinkChip>
  );

  return (
    <InlinePopover trigger={trigger} width="2xl" tooltip="UI element context">
      <Inset pad="sm">
        <Stack gap="sm">
          <Stack direction="row" gap="2xs" align="center">
            <MdAdsClick
              className={cn("text-muted-foreground size-4", rigidClass())}
            />
            <Text
              as="span"
              variant="label"
              className={cn(fillClasses("x"), "break-all")}
            >
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
