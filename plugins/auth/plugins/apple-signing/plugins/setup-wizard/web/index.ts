import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { Auth } from "@plugins/auth/web";
import { SiApple } from "react-icons/si";
import { appleSetupPane } from "./panes";
import { AppleProviderRow } from "./components/apple-provider-row";

export { appleSetupPane } from "./panes";

export default {
  description:
    "Apple code-signing UI: the Accounts 'Apple Developer' provider row plus the guided certificate + App Store Connect API key setup wizard pane.",
  contributions: [
    Pane.Register({ pane: appleSetupPane }),
    Auth.Provider({
      id: "apple-signing",
      name: "Apple Developer",
      icon: SiApple,
      rowComponent: AppleProviderRow,
      configureCredentials: () => openPane(appleSetupPane, {}, { mode: "root" }),
    }),
  ],
} satisfies PluginDefinition;
