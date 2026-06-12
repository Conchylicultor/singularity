import { MdAdsClick, MdClose } from "react-icons/md";
import type { UiContextMeta } from "../../core";
import { Inset, Stack } from "@plugins/primitives/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";

/** A single detail row in the popover: label + value, value omitted when absent. */
function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <Stack as="div" direction="row" gap="sm" align="baseline">
      <Text
        as="span"
        variant="caption"
        tone="muted"
        className="w-14 shrink-0 text-right"
      >
        {label}
      </Text>
      <Text as="span" variant="caption" className="min-w-0 break-all">
        {value}
      </Text>
    </Stack>
  );
}

/** The compact inline chip representing a captured UI element. Clicking it opens
 * a popover with the full captured metadata. */
export function UiContextChip({
  meta,
  onRemove,
}: {
  meta: UiContextMeta;
  onRemove?: () => void;
}) {
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
    <InlinePopover trigger={trigger} contentClassName="w-80" tooltip="UI element context">
      <Inset pad="sm">
        <Stack gap="sm">
          <Stack direction="row" gap="2xs" align="center" className="min-w-0">
            <MdAdsClick className="text-muted-foreground size-4 shrink-0" />
            <Text as="span" variant="label" className="min-w-0 break-all">
              {meta.element}
            </Text>
            {onRemove && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="text-muted-foreground hover:text-foreground ml-auto shrink-0"
                aria-label="Remove UI element context"
              >
                <MdClose className="size-4" />
              </button>
            )}
          </Stack>
          <Stack gap="2xs">
            <DetailRow label="Plugin" value={meta.pluginId} />
            <DetailRow label="Slot" value={meta.slotId} />
            <DetailRow label="Path" value={meta.path} />
            <DetailRow label="Pane" value={meta.paneId} />
            <DetailRow label="Selector" value={meta.selector} />
            <DetailRow label="URL" value={meta.url} />
          </Stack>
        </Stack>
      </Inset>
    </InlinePopover>
  );
}
