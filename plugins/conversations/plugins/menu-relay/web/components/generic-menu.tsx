import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { MenuVariantProps } from "../variant-props";

/** Any menu no variant knows: its title and one button per option. */
export function GenericMenu({ menu, choose, pending }: MenuVariantProps) {
  return (
    <Stack gap="xs">
      <Text as="p" variant="caption" tone="muted">
        The terminal is asking — answer here, or in the terminal
      </Text>
      {menu.title && (
        <Text as="p" variant="label">
          {menu.title}
        </Text>
      )}
      <Stack gap="2xs" align="start">
        {menu.options.map((o) => (
          <Stack key={o.n} gap="none">
            <Button
              variant={o.n === menu.highlighted ? "default" : "outline"}
              loading={pending === o.n}
              disabled={pending !== null}
              onClick={() => choose(o.n)}
            >
              {o.label}
            </Button>
            {o.description && (
              <Text as="p" variant="caption" tone="muted">
                {o.description}
              </Text>
            )}
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
