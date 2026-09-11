import type { ReactNode } from "react";
import { Kbd } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { formatShortcutLabel } from "@plugins/primitives/plugins/shortcuts/web";
import { viewerKey, type ViewerAction } from "../../core";

/** A cap as printed: `"mod"` is the platform's ⌘ / Ctrl. */
function capLabel(cap: string): string {
  return cap === "mod" ? formatShortcutLabel("mod") : cap;
}

/** The key caps for one cap list, as `<Kbd>` badges. */
export function KeyCaps({ caps }: { caps: readonly string[] }) {
  return (
    <>
      {caps.map((cap) => (
        <Kbd key={cap}>{capLabel(cap)}</Kbd>
      ))}
    </>
  );
}

/** A button tooltip: its label, then the key that does the same thing — read
 *  from `VIEWER_KEYS`, so the tooltip and the key handler cannot disagree. */
export function keyTooltip(label: string, action: ViewerAction): ReactNode {
  return (
    <>
      {label}
      <KeyCaps caps={viewerKey(action).caps} />
    </>
  );
}
