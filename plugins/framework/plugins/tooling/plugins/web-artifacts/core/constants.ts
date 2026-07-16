// Shared constants of the per-plugin web-artifact engine.

/**
 * Bump to invalidate EVERY stored artifact fleet-wide (hash input). Use when the
 * builder's semantics change in a way the other hash inputs can't see (config
 * shape, css-injection snippet, interop wrapper format, …).
 */
export const BUILDER_VERSION = 6;

/**
 * Inline allowlist: npm PACKAGES bundled *into* consumers instead of vendored.
 * Only provably-stateless packages where whole-package vendoring is harmful
 * belong here. `react-icons`: the full `react-icons/md` is ~2 MB; the monolith
 * tree-shakes to the used union, and per-plugin inlining + tree-shaking keeps
 * that property. Icons are pure components (the repo never uses `IconContext`,
 * the package's only module state), so N inlined copies are safe.
 */
export const INLINE_PACKAGES: ReadonlySet<string> = new Set(["react-icons"]);

/**
 * Vendor specifiers force-included even when no first-party source imports them
 * directly. `react/jsx-runtime` + `react/compiler-runtime` are injected by the
 * JSX/babel transforms; `scheduler` is react-dom's stateful work-loop dependency
 * and must be a single shared module, never inlined into two vendor bundles.
 */
export const FORCED_VENDOR_SPECS: ReadonlyArray<string> = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/compiler-runtime",
  "scheduler",
];

/**
 * Folder-barrel KINDS whose DYNAMIC imports are declared browser-unreachable.
 * The barrel closure follows every other dynamic `@plugins/*` import into a
 * mapped, lazily-fetched artifact (the import-map twin of the monolith's lazy
 * chunk); kinds listed here are skipped and stay silent at compose. Static
 * imports of these kinds still compose normally — the exemption is only about
 * the dynamic edge.
 *
 * - `prewarm` — asset-mirror prewarm registries (`defineAssetMirrorPrewarm`
 *   data). Their loaders are invoked only by the release runner (Bun-side,
 *   via the composition-filtered variant) to bake mirror files into release
 *   bundles; no browser code path ever calls them (`runAssetMirrorPrewarm`
 *   lives in asset-mirror's server barrel).
 */
export const BROWSER_UNREACHABLE_DYNAMIC_KINDS: ReadonlySet<string> = new Set(["prewarm"]);

/** The folder-barrel kind of a `@plugins/<path>/<kind>` specifier (its last segment), or null. */
export function barrelKindOf(specifier: string): string | null {
  if (!specifier.startsWith("@plugins/")) return null;
  const rel = specifier.slice("@plugins/".length);
  const slash = rel.lastIndexOf("/");
  return slash > 0 ? rel.slice(slash + 1) : null;
}

/** True when a DYNAMIC import of `specifier` is declared browser-unreachable (exempt). */
export function isBrowserUnreachableDynamic(specifier: string): boolean {
  const kind = barrelKindOf(specifier);
  return kind !== null && BROWSER_UNREACHABLE_DYNAMIC_KINDS.has(kind);
}

/** The npm package name of a (sub-path) specifier: `@scope/pkg/x` → `@scope/pkg`. */
export function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

/** True for npm-style bare specifiers (not relative, absolute, virtual, or aliased). */
export function isBareSpecifier(id: string): boolean {
  return (
    !id.startsWith(".") &&
    !id.startsWith("/") &&
    !id.startsWith("\0") &&
    !id.startsWith("@plugins/") &&
    !id.startsWith("@composition-web-registry")
  );
}

/** True when `specifier` belongs to an inline-allowlisted package. */
export function isInlinedPackage(specifier: string): boolean {
  return INLINE_PACKAGES.has(packageNameOf(specifier));
}
