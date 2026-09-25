import type { DerivedUpdatedAtSpec } from "./types";

// ── Registry ────────────────────────────────────────────────────────────────
// Filled by `defineEntity` at module eval. Every `tables.ts` is evaluated during
// plugin load, before any `onReadyBlocking` — the same guarantee
// `View.getContributions()` relies on — so it is complete when the database
// plugin installs from it.
const registry = new Map<string, DerivedUpdatedAtSpec>();

export function registerDerivedUpdatedAt(spec: DerivedUpdatedAtSpec): void {
  const prior = registry.get(spec.table);
  if (prior && prior.signature !== spec.signature) {
    throw new Error(
      `derived updatedAt: table "${spec.table}" was declared twice with ` +
        `different touchedBy rules.`,
    );
  }
  registry.set(spec.table, spec);
}

export function registeredDerivedUpdatedAt(): readonly DerivedUpdatedAtSpec[] {
  return [...registry.values()];
}
