import { FullPane } from "@plugins/layouts/plugins/full-pane/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";

/**
 * The Prototypes app layout. No sidebar / toolbar of its own — the gallery root
 * pane is the app surface, and opening a prototype replaces it with the canvas,
 * full-surface: the full-pane renderer paints only the active pane, and the
 * detail pane's header leads with Back to the gallery (its parent route).
 */
export function PrototypesLayout() {
  return (
    <AppShellLayout>
      <FullPane />
    </AppShellLayout>
  );
}
