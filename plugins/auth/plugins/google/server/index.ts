import type { ServerPluginDefinition } from "@server/types";
import { googleAuthConfig } from "../shared";
import "./internal/register";

export default {
  id: "auth-google",
  name: "Auth: Google",
  description:
    "Google OAuth 2.0 provider. Use with Drive, Gmail, Calendar consumer plugins via incremental scopes.",
  config: googleAuthConfig,
} satisfies ServerPluginDefinition;
