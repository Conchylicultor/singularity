import type { PluginDefinition } from "@core";
import { Auth } from "@plugins/auth/web";
import { Config } from "@plugins/config/web";
import { SiNotion } from "react-icons/si";
import { notionAuthConfig } from "../shared";

export default {
  id: "auth-notion",
  name: "Auth: Notion",
  description:
    "Notion OAuth provider (scaffold). Adds the Notion row to the Accounts pane and a credentials section to Settings.",
  contributions: [
    Auth.Provider({
      id: "notion",
      name: "Notion",
      icon: SiNotion,
      helpUrl: "https://www.notion.so/my-integrations",
    }),
    Config.Spec(notionAuthConfig),
  ],
} satisfies PluginDefinition;
