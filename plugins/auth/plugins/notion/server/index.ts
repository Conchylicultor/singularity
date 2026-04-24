import type { ServerPluginDefinition } from "@server/types";
import { notionAuthConfig } from "../shared";
import "./internal/register";

export default {
  id: "auth-notion",
  name: "Auth: Notion",
  description:
    "Notion OAuth provider (scaffold). Surfaces in Accounts pane; end-to-end smoke not yet validated.",
  config: notionAuthConfig,
} satisfies ServerPluginDefinition;
