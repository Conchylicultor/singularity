import type { PluginDefinition } from "@core";

export { Breadcrumb, type BreadcrumbProps } from "./internal/breadcrumb";

export default {
  id: "breadcrumb",
  name: "Breadcrumb",
  description:
    "File-path breadcrumb with per-segment clickable navigation. Exposes <Breadcrumb path={…} onNavigate={…} />.",
  contributions: [],
} satisfies PluginDefinition;
