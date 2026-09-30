import { addProvider, type BackgroundKindSpec } from "./providers";

/**
 * A registered provider: mount it in the plugin's `register: [...]`, and call
 * `changed` when what it reports may have moved. Structurally a `Registration`
 * of both the server and the central runtime.
 */
export interface BackgroundKind {
  readonly kind: string;
  readonly _kind: "background-kind";
  readonly _factory: "defineBackgroundKind";
  readonly _doc: { label: string; detail: string };
  register(): void;
  /**
   * Say that this provider's entries (or one entry's runs, when `name` is
   * given) may have changed. Cheap and synchronous — safe from inside an event
   * emitter; the pushes it causes are throttled.
   */
  changed(name?: string): void;
}

/** What a runtime's served catalog exposes to its providers' `changed`. */
export interface CatalogNotifier {
  catalog(): void;
  recentRuns(params: { kind: string; name: string }): void;
}

/** The one construction of a provider, parameterised by the runtime serving it. */
export function makeBackgroundKind(
  spec: BackgroundKindSpec,
  notifier: CatalogNotifier,
): BackgroundKind {
  return {
    kind: spec.kind,
    _kind: "background-kind",
    _factory: "defineBackgroundKind",
    _doc: { label: spec.kind, detail: spec.label },
    register() {
      addProvider(spec);
    },
    changed(name) {
      notifier.catalog();
      if (name !== undefined) notifier.recentRuns({ kind: spec.kind, name });
    },
  };
}
