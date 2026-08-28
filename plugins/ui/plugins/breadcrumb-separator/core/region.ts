import { defineVariantRegion } from "@plugins/ui/plugins/variant-region/core";
import type { BreadcrumbSeparatorProps } from "@plugins/primitives/plugins/breadcrumb/core";

/**
 * The breadcrumb-separator region: which mark stands between two crumbs.
 *
 * Global scope (not per-app): a trail is the same object wherever it is shown —
 * a page's ancestors, a file's directories, a plugin's id — and which mark
 * separates its parts is one reading preference, not the chrome of one app.
 *
 * Defaults to `chevron` — the trail's own inline default, so loading this
 * plugin changes nothing until the user picks the slash in the theme
 * customizer.
 */
export const breadcrumbSeparator =
  defineVariantRegion<BreadcrumbSeparatorProps>({
    id: "breadcrumb-separator",
    label: "Breadcrumb separator",
    defaultVariant: "chevron",
  });
