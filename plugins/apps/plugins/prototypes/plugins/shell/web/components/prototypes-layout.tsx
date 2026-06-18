import { MillerColumns } from "@plugins/layouts/plugins/miller/web";
import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";

/**
 * The Prototypes app layout. No sidebar / toolbar of its own — the gallery root
 * pane is the app surface; opening a prototype pushes the Focus/Compare detail
 * pane as a Miller column beside it.
 */
export function PrototypesLayout() {
  return (
    <AppShellLayout>
      <MillerColumns />
    </AppShellLayout>
  );
}
