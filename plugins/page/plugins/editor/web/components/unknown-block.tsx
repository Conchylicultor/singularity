import { Text } from "@plugins/primitives/plugins/text/web";
import type { BlockRendererProps } from "../types";

export function UnknownBlock({ block }: BlockRendererProps) {
  return (
    <Text as="div" variant="caption" className="px-md py-xs text-muted-foreground font-mono">
      Unknown block: {block.type}
    </Text>
  );
}
