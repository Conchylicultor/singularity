import type { AuthProviderDescriptor } from "@plugins/auth/shared";
import { AuthProviderUnknownError } from "@plugins/auth/shared";

const providers = new Map<string, AuthProviderDescriptor>();

export function registerAuthProvider(d: AuthProviderDescriptor): void {
  if (providers.has(d.id)) {
    throw new Error(`auth: duplicate provider registration for "${d.id}"`);
  }
  providers.set(d.id, d);
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
