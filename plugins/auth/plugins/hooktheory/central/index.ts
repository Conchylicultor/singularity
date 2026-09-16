import type { CentralPluginDefinition } from "@plugins/framework/plugins/central-core/core";
import { hooktheoryAuthRegistration } from "./internal/register";

export default {
  description:
    "Hooktheory (TheoryTab) username/password provider. The password is traded once for Hooktheory's long-lived API token; only the token is stored, in the central auth token store (encrypted, shared across worktrees).",
  register: [hooktheoryAuthRegistration],
} satisfies CentralPluginDefinition;
