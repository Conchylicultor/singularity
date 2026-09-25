import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { ReactNode } from "react";

export interface TooltipDocProps {
  /** The control's name, as its label reads. */
  title: ReactNode;
  /** What it does, in a sentence or two — for someone seeing it the first time. */
  children: ReactNode;
}

/**
 * A documenting tooltip body: the control's name, then what it does. For a
 * control whose label alone does not tell a new user what clicking it will do
 * ("Attach page URL" — attach it where, and for whom?). Pass it as
 * `WithTooltip`'s `content` or `IconButton`'s `tooltip`.
 */
export function TooltipDoc({ title, children }: TooltipDocProps) {
  return (
    <Stack gap="2xs" className="py-2xs">
      <Text variant="caption" className="font-medium">
        {title}
      </Text>
      <Text variant="caption" tone="muted">
        {children}
      </Text>
    </Stack>
  );
}
