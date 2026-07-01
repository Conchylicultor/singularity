import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { appleSigningConfig } from "../shared";

export default {
  description:
    "Apple code-signing config registration (web). The Accounts provider row + setup wizard UI live in the setup-wizard sub-plugin.",
  contributions: [ConfigV2.WebRegister({ descriptor: appleSigningConfig })],
} satisfies PluginDefinition;
