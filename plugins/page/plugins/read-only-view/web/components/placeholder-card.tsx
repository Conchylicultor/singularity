import { Icon } from "@plugins/ui/plugins/icons/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { symbol, type IconRef } from "@plugins/ui/plugins/icons/core";

const widgetsIcon = symbol("widgets");

/**
 * A clean, professional labeled card standing in for a block type the read-only
 * renderer cannot faithfully reproduce without the live editor API (embed,
 * equation, bookmark, audio, video, file). This is the documented fidelity gap —
 * never broken markup. Shows the block's human label + icon and an optional
 * caption (e.g. a filename) so the reader knows exactly what was there.
 */
export function PlaceholderCard({
  label,
  caption,
  icon = widgetsIcon,
}: {
  label: string;
  caption?: string;
  icon?: IconRef;
}) {
  return (
    <Inset x="md" y="xs">
      <Surface level="raised">
        <Inset pad="md">
          <Stack direction="row" gap="sm" align="center">
            <Text as="span" variant="body" tone="muted" aria-hidden>
              <Icon icon={icon} className="size-5" />
            </Text>
            <Stack gap="none">
              <Text variant="label">{label}</Text>
              {caption ? (
                <Text variant="caption" tone="muted">
                  {caption}
                </Text>
              ) : null}
            </Stack>
          </Stack>
        </Inset>
      </Surface>
    </Inset>
  );
}
