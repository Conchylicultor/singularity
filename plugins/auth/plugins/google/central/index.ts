import type { CentralPluginDefinition } from "@central/types";
import "./internal/register";

export default {
  id: "auth-google",
  name: "Auth: Google",
  description:
    "Google OAuth 2.0 provider. Use with Drive, Gmail, Calendar consumer plugins via incremental scopes.",
} satisfies CentralPluginDefinition;
