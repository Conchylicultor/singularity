import type { ComponentType } from "react";
import { MdWidgets } from "react-icons/md";
import { Surface } from "@plugins/primitives/plugins/surface/web";
import { Inset, Stack } from "@plugins/primitives/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";

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
  icon: Icon = MdWidgets,
}: {
  label: string;
  caption?: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <Inset x="md" y="xs">
      <Surface level="raised">
        <Inset pad="md">
          <Stack direction="row" gap="sm" align="center">
            <Text as="span" variant="body" tone="muted" aria-hidden>
              <Icon className="size-5" />
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
