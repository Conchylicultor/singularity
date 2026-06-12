import { MdAdsClick, MdClose } from "react-icons/md";
import type { UiContextMeta } from "../../core";
import { Inset, Stack } from "@plugins/primitives/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";

/** The rich inline block representing a captured UI element as a single chip. */
export function UiContextChip({
  meta,
  onRemove,
}: {
  meta: UiContextMeta;
  onRemove?: () => void;
}) {
  const hostLabel = meta.pluginId ?? new URL(meta.url).pathname;

  return (
    <Inset
      as="span"
      x="xs"
      y="2xs"
      contentEditable={false}
      className="group bg-muted border-border text-foreground inline-flex max-w-full rounded-md border align-middle"
    >
      <Stack as="span" direction="row" gap="2xs" align="center" className="min-w-0">
        <MdAdsClick className="text-muted-foreground size-3.5 shrink-0" />
        <Text as="span" variant="label" className="min-w-0 truncate">
          {meta.element}
        </Text>
        <Text
          as="span"
          variant="caption"
          tone="muted"
          className="min-w-0 truncate"
        >
          {hostLabel}
        </Text>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Remove UI element context"
          >
            <MdClose className="size-3" />
          </button>
        )}
      </Stack>
    </Inset>
  );
}
