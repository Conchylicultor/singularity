import type { CentralPluginDefinition } from "./types";
import secretsPlugin from "@plugins/infra/plugins/secrets/central";

// Central plugins are added here as the migration proceeds.
// Phase 2: secrets.
// Phase 3: auth + provider sub-plugins.
export const plugins: CentralPluginDefinition[] = [secretsPlugin];
