import { FullPane } from "@plugins/layouts/plugins/full-pane/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";

/**
 * The Chord app's surface: the standard sidebar-less app shell around the
 * full-pane renderer. The shell registers no pane of its own — the trainer
 * registers the app's index pane, whose pane header is the surface's top
 * chrome and so carries the app launcher at its leading edge.
 */
export function ChordLayout() {
  return (
    <AppShellLayout>
      <FullPane />
    </AppShellLayout>
  );
}
