import type { CentralPluginDefinition } from "./types";
import secretsPlugin from "@plugins/infra/plugins/secrets/central";
import authPlugin from "@plugins/auth/central";
import googleAuthPlugin from "@plugins/auth/plugins/google/central";
import notionAuthPlugin from "@plugins/auth/plugins/notion/central";

// Central plugins are added here as the migration proceeds.
// Phase 2: secrets.
// Phase 3: auth + provider sub-plugins (google, notion).
//
// Order matters at module-import time: provider sub-plugins import auth's
// `registerAuthProvider`, so auth must be evaluated first. With the imports
// hoisted to the top of this module, that's already the case.
export const plugins: CentralPluginDefinition[] = [
  secretsPlugin,
  authPlugin,
  googleAuthPlugin,
  notionAuthPlugin,
];
