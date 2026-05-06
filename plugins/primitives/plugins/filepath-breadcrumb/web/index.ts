import type { PluginDefinition } from "@core";

export {
  FilepathBreadcrumb,
  type FilepathBreadcrumbProps,
} from "./internal/filepath-breadcrumb";

export default {
  id: "filepath-breadcrumb",
  name: "Filepath Breadcrumb",
  description:
    "File-path breadcrumb with copy-to-clipboard and directory navigation. Wraps the generic Breadcrumb with filepath-specific behavior.",
  contributions: [],
} satisfies PluginDefinition;
