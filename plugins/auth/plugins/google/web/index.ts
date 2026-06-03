import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { openPane } from "@plugins/primitives/plugins/pane/web";
import { Auth } from "@plugins/auth/web";
import { ConfigV2 } from "@plugins/config_v2/web";
import { SiGoogle } from "react-icons/si";
import { googleAuthConfig } from "../shared";
import { googleSetupPane } from "@plugins/auth/plugins/google/plugins/setup-wizard/web";

export default {
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
    ConfigV2.WebRegister({ descriptor: googleAuthConfig }),
  ],
} satisfies PluginDefinition;
