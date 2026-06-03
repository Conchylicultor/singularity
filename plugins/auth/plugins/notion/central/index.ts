import type { CentralPluginDefinition } from "@plugins/framework/plugins/central-core/core";
import { notionAuthRegistration } from "./internal/register";

export default {
  name: "Auth: Notion",
  description:
    "Notion OAuth provider (scaffold). Surfaces in Accounts pane; end-to-end smoke not yet validated.",
  register: [notionAuthRegistration],
} satisfies CentralPluginDefinition;
