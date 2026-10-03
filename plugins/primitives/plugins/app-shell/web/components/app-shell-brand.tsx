import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { AppShell, type AppShellBrandForm } from "../slots";

/** Whether anything contributes the brand — the shell reserves no room without one. */
export function useHasAppShellBrand(): boolean {
  return AppShell.Brand.useContributions().length > 0;
}

/**
 * The contributed {@link AppShell.Brand} in one of its forms, isolated in its
 * own error boundary; nothing when no plugin contributes one.
 *
 * `AppShellLayout` places it itself (sidebar header / leading chrome). An app
 * with a bespoke chrome bar of its own — not built on `AppShellLayout` — renders
 * `<AppShellBrand form="icon"/>` at that bar's leading edge, so it shows the
 * same brand in the same spot.
 */
export function AppShellBrand({ form }: { form: AppShellBrandForm }) {
  const brand = AppShell.Brand.useContributions()[0];
  // useContributions() seals `component`; renderIsolated unseals it and applies
  // the error-boundary middleware.
  return brand
    ? renderIsolated(AppShell.Brand, brand as unknown as Contribution, {
        form,
      })
    : null;
}
