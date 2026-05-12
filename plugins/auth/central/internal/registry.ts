import type { Registration } from "@central/types";
import type { AuthProviderDescriptor } from "@plugins/auth/core";
import { AuthProviderUnknownError } from "@plugins/auth/core";

const providers = new Map<string, AuthProviderDescriptor>();

/**
 * Returns a {@link Registration} token. The actual `providers.set` (and the
 * duplicate-id guard) fire when the framework invokes `.register()` during
 * the plugin register phase. Provider plugins list the result in their
 * `register` array on `CentralPluginDefinition`.
 */
export function registerAuthProvider(d: AuthProviderDescriptor): Registration {
  return {
    register() {
      if (providers.has(d.id)) {
        throw new Error(`auth: duplicate provider registration for "${d.id}"`);
      }
      providers.set(d.id, d);
    },
  };
}

export function getProvider(id: string): AuthProviderDescriptor {
  const p = providers.get(id);
  if (!p) throw new AuthProviderUnknownError(id);
  return p;
}

export function tryGetProvider(
  id: string,
): AuthProviderDescriptor | undefined {
  return providers.get(id);
}

export function listProviderIds(): string[] {
  return [...providers.keys()];
}

export function listProviders(): AuthProviderDescriptor[] {
  return [...providers.values()];
}
