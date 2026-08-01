import type { ReactNode } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

/**
 * A section's collapsed-state count ("12 exports", "3 direct · 9 total").
 *
 * Contributed as a `PluginViewSlots.Section` `summary`, so it renders beside the
 * host's own title and stays readable while the card is shut. This is all that
 * survives of the old `Section` helper: the host owns the title now, and the
 * count was the only other thing that helper carried.
 */
export function SectionCount({ children }: { children: ReactNode }) {
  return (
    <Text variant="caption" tone="muted">
      {children}
    </Text>
  );
}
