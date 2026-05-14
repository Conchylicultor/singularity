import type { PluginDefinition } from "@core";
import { openPane } from "@plugins/primitives/plugins/pane/web";
import { Auth } from "@plugins/auth/web";
import { Config } from "@plugins/config/web";
import { SiGoogle } from "react-icons/si";
import { googleAuthConfig } from "../shared";
import { googleSetupPane } from "@plugins/auth/plugins/google/plugins/setup-wizard/web";

export default {
  id: "auth-google",
  name: "Auth: Google",
  description:
    "Google OAuth provider — adds the Google row to the Accounts pane and a credentials section to Settings.",
  contributions: [
    Auth.Provider({
      id: "google",
      name: "Google",
      icon: SiGoogle,
      helpUrl: "https://console.cloud.google.com/apis/credentials",
      configureCredentials: () => openPane(googleSetupPane, {}, { mode: "root" }),
    }),
    Config.Spec(googleAuthConfig),
  ],
} satisfies PluginDefinition;
