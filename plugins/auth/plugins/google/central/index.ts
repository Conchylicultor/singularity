import type { CentralPluginDefinition } from "@plugins/framework/plugins/central-core/core";
import { googleAuthRegistration } from "./internal/register";

export default {
  description:
    "Google OAuth 2.0 provider. Use with Drive, Gmail, Calendar consumer plugins via incremental scopes.",
  register: [googleAuthRegistration],
} satisfies CentralPluginDefinition;
