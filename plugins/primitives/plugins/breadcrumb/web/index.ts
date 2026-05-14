import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Breadcrumb,
  type BreadcrumbProps,
  type BreadcrumbSegment,
} from "./internal/breadcrumb";

export default {
  id: "breadcrumb",
  name: "Breadcrumb",
  description:
    "Generic breadcrumb with arbitrary segments, configurable separator, and trailing actions slot.",
  contributions: [],
} satisfies PluginDefinition;
