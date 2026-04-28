// Helper for OAuth provider descriptors that live in central/. Reads
// `defineConfig` fields from the central secrets store. Only fields marked
// `secret: true` are global (the worktree config DB is invisible from
// central) — non-secret fields fall back to their declared default.
//
// OAuth client credentials must be declared `secret: true` so they round-trip
// through this code path. See `plugins/auth/plugins/google/shared/config.ts`
// for the canonical example.

import type {
  ConfigDescriptor,
  Schema,
  Values,
} from "@plugins/config/shared";
import { fullKey, getDefault, normalize } from "@plugins/config/shared";
import { getSecret } from "@plugins/infra/plugins/secrets/central";

const CONFIG_SECRETS_NAMESPACE = "config-fields";

export async function readGlobalConfig<S extends Schema>(
  pluginId: string,
  descriptor: ConfigDescriptor<S>,
): Promise<Values<S>> {
  const fields = normalize(descriptor.schema);
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === "secret") {
      const v = await getSecret({
        namespace: CONFIG_SECRETS_NAMESPACE,
        key: fullKey(pluginId, f.key),
      });
      out[f.key] = v ?? "";
      continue;
    }
    // Non-secret fields are per-worktree and not accessible from central. Fall
    // back to the declared default so the descriptor at least gets a value.
    out[f.key] = f.default;
  }
  for (const [k, raw] of Object.entries(descriptor.schema)) {
    if (!(k in out)) out[k] = getDefault(raw);
  }
  return out as Values<S>;
}
