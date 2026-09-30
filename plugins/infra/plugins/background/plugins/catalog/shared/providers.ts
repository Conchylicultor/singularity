import type { BackgroundEntryDraft, BackgroundRun } from "../core";

/**
 * What a background mechanism implements to appear in the catalog. The catalog
 * calls these and never names a provider: adding a mechanism (jobs, warm-ups,
 * timers) is one `defineBackgroundKind` in the mechanism's own plugin.
 */
export interface BackgroundKindSpec {
  /** Stable id, stamped on every entry (`job`). Unique across providers. */
  kind: string;
  /** What these are, for a person ("Jobs"). */
  label: string;
  /**
   * Where this provider's groups sit in the list, lowest first; ties keep
   * registration order. The provider states its own place — the catalog
   * ranks no provider by name.
   */
  order: number;
  /** Every entry this provider declares in this backend, with its latest run.
   * Bounded by the declared set. */
  list(): Promise<BackgroundEntryDraft[]>;
  /** One entry's recent runs, newest first. Absent ⇒ the provider keeps no run
   * history (the page says so rather than showing an empty list). */
  recentRuns?(name: string): Promise<BackgroundRun[]>;
  /** Start one entry now. Called only for an entry listed `canRunNow: true`.
   * Returns a reference to what was started (a job id). */
  runNow?(name: string): Promise<{ ref: string }>;
}

// The registered providers, filled during the register phase. Process state:
// the set is what this backend's composition declares.
const providers = new Map<string, BackgroundKindSpec>();

export function addProvider(spec: BackgroundKindSpec): void {
  if (providers.has(spec.kind)) {
    throw new Error(
      `[background] duplicate background kind "${spec.kind}" — each provider declares its own kind`,
    );
  }
  providers.set(spec.kind, spec);
}

/** Every registered provider, by `order` (stable: registration order within
 * one order). */
export function registeredProviders(): BackgroundKindSpec[] {
  return [...providers.values()].sort((a, b) => a.order - b.order);
}

/** The provider of `kind`; throws naming the known kinds. */
export function providerOf(kind: string): BackgroundKindSpec {
  const spec = providers.get(kind);
  if (spec === undefined)
    throw new UnknownBackgroundKindError(kind, [...providers.keys()]);
  return spec;
}

export class UnknownBackgroundKindError extends Error {
  constructor(
    readonly kind: string,
    readonly known: readonly string[],
  ) {
    super(
      `No background kind "${kind}" is registered. ` +
        (known.length === 0 ? "None is." : `Registered: ${known.join(", ")}.`),
    );
  }
}
