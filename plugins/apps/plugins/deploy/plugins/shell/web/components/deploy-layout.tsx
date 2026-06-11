import { AppShellLayout } from "@plugins/primitives/plugins/app-shell/web";
import { MillerColumns } from "@plugins/layouts/plugins/miller/web";

export function DeployLayout() {
  // No app-level sidebar or toolbar — navigation lives in the first Miller
  // column — so the shell collapses to its transparent full-surface host,
  // which supplies the muted `<main>` backdrop the column stack sits on.
  return (
    <AppShellLayout>
      <MillerColumns />
    </AppShellLayout>
  );
}
