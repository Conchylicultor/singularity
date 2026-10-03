import { useSurfaceTabId } from "@plugins/primitives/plugins/scope/plugins/surface-id/web";
import type { ActiveApp } from "@plugins/apps-core/web";
import { useTabs } from "./use-tabs";

/**
 * Switch to an installed app, exactly as every app switcher does: the entry's
 * own `onClick` when it declares one, else swap the app in place in the tab
 * the switcher is drawn in — its own surface tab (a Home window, an app's
 * header), or the focused tab for chrome outside any surface (the app rail).
 *
 * The one statement of "activate an app entry", shared by the rail, the
 * launcher popover and the Home gallery so they cannot disagree about which
 * tab a pick lands in.
 */
export function useActivateApp(): (
  entry: Pick<ActiveApp, "id" | "onClick">,
) => void {
  const { focusedTabId, replaceTabApp } = useTabs();
  const ownTabId = useSurfaceTabId();
  return (entry) => {
    if (entry.onClick) entry.onClick();
    else replaceTabApp(ownTabId ?? focusedTabId, entry.id);
  };
}
