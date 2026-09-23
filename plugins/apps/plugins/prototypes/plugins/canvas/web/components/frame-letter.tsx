import type { ReactElement } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { colorOf, letterOf } from "../internal/frame-name";

/**
 * A frame's coloured letter (A, B, C…) — its identity everywhere it is named:
 * the frame header, the options popover's heading, the "who else uses this
 * value" marks. The colour is the theme's categorical series, by position.
 */
export function FrameLetter({
  index,
  small = false,
}: {
  /** The frame's position on the canvas. */
  index: number;
  /** The mark beside an option value, rather than a header's badge. */
  small?: boolean;
}): ReactElement {
  const color = colorOf(index);
  return (
    <Center
      as="span"
      aria-hidden
      className={cn(
        rigidClass(),
        "rounded-sm",
        small ? "size-3.5" : "size-[18px]",
        color.tint,
      )}
    >
      <Text
        variant={small ? "eyebrow" : "caption"}
        className={cn("font-bold", color.text)}
      >
        {letterOf(index)}
      </Text>
    </Center>
  );
}
