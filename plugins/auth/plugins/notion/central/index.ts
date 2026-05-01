import type { CentralPluginDefinition } from "@central/types";
import { notionAuthRegistration } from "./internal/register";

export default {
  id: "auth-notion",
  name: "Auth: Notion",
  description:
    "Notion OAuth provider (scaffold). Surfaces in Accounts pane; end-to-end smoke not yet validated.",
  register: [notionAuthRegistration],
} satisfies CentralPluginDefinition;
