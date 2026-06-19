import { MdAdsClick } from "react-icons/md";
import { UI_CONTEXT_FIELDS, type UiContextMeta } from "../../core";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";

/** A single detail row in the popover: label + value, value omitted when absent. */
function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <Frame
      gap="sm"
      align="baseline"
      leading={
        <Text
          as="span"
          variant="caption"
          tone="muted"
          className="w-14 text-right"
        >
          {label}
        </Text>
      }
      content={
        <Text as="span" variant="caption" className="break-all">
          {value}
        </Text>
      }
    />
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
      className="bg-muted border-border text-foreground hover:bg-accent inline-block max-w-40 cursor-pointer rounded-md border align-middle transition-colors"
    >
      <Frame
        as="span"
        gap="2xs"
        leading={<MdAdsClick className="text-muted-foreground size-3.5" />}
        content={
          <Text as="span" variant="label">
            {meta.element}
          </Text>
        }
      />
    </Inset>
  );

  return (
    <InlinePopover trigger={trigger} contentClassName="w-80" tooltip="UI element context">
      <Inset pad="sm">
        <Stack gap="sm">
          <Frame
            gap="2xs"
            leading={<MdAdsClick className="text-muted-foreground size-4" />}
            content={
              <Text as="span" variant="label" className="break-all">
                {meta.element}
              </Text>
            }
          />
          <Stack gap="2xs">
            {/* Every field is rendered straight from the shared registry, so the
                popover can never silently drop a field the tag carries — adding a
                field to UI_CONTEXT_FIELDS surfaces it here automatically. */}
            {UI_CONTEXT_FIELDS.map((f) => (
              <DetailRow key={f.key} label={f.label} value={meta[f.key]} />
            ))}
          </Stack>
        </Stack>
      </Inset>
    </InlinePopover>
  );
}
