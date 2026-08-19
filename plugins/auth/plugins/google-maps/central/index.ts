import type { CentralPluginDefinition } from "@plugins/framework/plugins/central-core/core";
import { googleMapsAuthRegistration } from "./internal/register";

export default {
  description:
    "Google Maps Platform API-key provider. The key is stored in the central auth token store (encrypted, shared across worktrees) and verified against the Places API before it is accepted.",
  register: [googleMapsAuthRegistration],
} satisfies CentralPluginDefinition;
