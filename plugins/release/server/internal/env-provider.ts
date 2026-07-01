import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";

// Generic, decoupled release-env contribution slot. Other plugins contribute
// extra environment variables for a given release target (e.g. a future
// Apple-signing plugin contributes `APPLE_*` vars for target "tauri") WITHOUT
// the release engine ever naming or importing them — the engine owns only this
// generic collection API (collection-consumer separation). A future
// Windows/Authenticode signer just adds another contributor; the engine is
// untouched.
//
// Mirrors the `ConfigV2.Register` server-contribution shape: a namespace object
// holding a `defineServerContribution` token, collected generically via
// `getContributions()`.
export const Release = {
  EnvProvider: defineServerContribution<{
    target: string;
    provide: () => Promise<Record<string, string> | null>;
  }>("Release.EnvProvider"),
};

/**
 * Enumerate every registered env provider, run those whose `target` matches,
 * await them, and merge the non-null results into one env object. Zero
 * contributors → `{}`. A provider returning null is skipped. A provider that
 * throws is allowed to throw (fail loudly) — never swallowed.
 */
export async function collectReleaseEnv(target: string): Promise<Record<string, string>> {
  const merged: Record<string, string> = {};
  for (const provider of Release.EnvProvider.getContributions()) {
    if (provider.target !== target) continue;
    const result = await provider.provide();
    if (result) Object.assign(merged, result);
  }
  return merged;
}
