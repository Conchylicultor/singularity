// The externals rule — the plugin-boundary grammar expressed to the bundler.
//
// One artifact per imported barrel specifier: everything that is NOT the
// plugin's own files stays verbatim in the emitted JS (the import map resolves
// it at runtime). This is what preserves module identity (React contexts, slot
// registries, live-state singleton, …) and what makes rebuilds cascade-free.

import { isBareSpecifier, isInlinedPackage } from "./constants";

/**
 * Build the Rollup `external` predicate for one plugin artifact.
 *
 * - Other plugins' `@plugins/*` specifiers → external (import map).
 * - The plugin's OWN `@plugins/<own>/core` barrel → ALWAYS external. One URL =
 *   one module instance: a core barrel can hold module state, and inlining the
 *   own copy while other plugins load the core artifact would double-instantiate
 *   it. (Stricter than "only when cross-imported" — it keeps the hash a pure
 *   function of the plugin's own files.)
 * - The plugin's own sub-plugins (`@plugins/<own>/plugins/…`) are DIFFERENT
 *   plugins → external.
 * - Every other own-path specifier (own `shared/`, own web internals, own-core
 *   deep files) → inlined.
 * - Bare npm specifiers → external unless the package is inline-allowlisted.
 *
 * `ownPluginPath` is null for the composition-root entry artifact (web-core),
 * which has no `@plugins` self-specifier — its own files are reached relatively.
 */
export function makeArtifactExternal(
  ownPluginPath: string | null,
): (id: string) => boolean {
  const ownPrefix = ownPluginPath ? `@plugins/${ownPluginPath}/` : null;
  const ownCore = ownPluginPath ? `@plugins/${ownPluginPath}/core` : null;
  return (id: string): boolean => {
    if (id.startsWith("\0")) return false;
    // A CSS specifier is never a module URL — package CSS (xterm.css, katex,
    // react-diff-view, …) and plugin CSS alike stay in-graph so vite's css
    // pipeline extracts them into the artifact's injected styles (the entry
    // build's strip plugin nulls the global app.css separately).
    if (id.endsWith(".css")) return false;
    if (id === "@composition-web-registry") return true;
    if (id.startsWith("@plugins/")) {
      if (ownCore !== null && id === ownCore) return true;
      if (
        ownPrefix !== null &&
        id.startsWith(ownPrefix) &&
        !id.slice(ownPrefix.length).startsWith("plugins/")
      ) {
        return false;
      }
      return true;
    }
    if (!isBareSpecifier(id)) return false;
    return !isInlinedPackage(id);
  };
}
