import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { Release } from "@plugins/release/server";
import { setAppleCertificateEndpoint } from "../core/endpoints";
import { appleSigningConfig } from "../shared/config";
import { handleSetAppleCertificate } from "./internal/certificate-endpoint";
import { getAppleSigningEnv } from "./internal/signing-env";

export { getAppleSigningEnv } from "./internal/signing-env";

export default {
  description:
    "Apple code-signing credentials: config fields + certificate upload + Tauri release env provider.",
  contributions: [
    ConfigV2.Register({ descriptor: appleSigningConfig }),
    Release.EnvProvider({ target: "tauri", provide: getAppleSigningEnv }),
  ],
  httpRoutes: {
    [setAppleCertificateEndpoint.route]: handleSetAppleCertificate,
  },
} satisfies ServerPluginDefinition;
