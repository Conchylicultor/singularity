// Canonical addressing for app-scoped config. config_v2 owns the scope wire
// format and the on-disk layout; it NEVER imports the apps plugin (a scopeId is
// an opaque "<kind>:<id>" tag). Shared by the server registry/propagation and the
// build-time codegen so the "@app" convention lives in exactly one place.

// On-disk subdirectory holding per-app scoped config, under a descriptor's
// hierarchy path: `<hier>/@app/<appId>/<name>.jsonc`.
export const APP_SCOPE_DIR = "@app";

// scopeId wire format is "app:<id>". Returns the bare app id, or undefined for
// the base scope ("") or a non-"app" kind.
export function scopeAppId(scopeId: string | undefined): string | undefined {
  if (!scopeId) return undefined;
  const idx = scopeId.indexOf(":");
  if (idx < 0) return undefined;
  if (scopeId.slice(0, idx) !== "app") return undefined;
  return scopeId.slice(idx + 1);
}

// Inverse of scopeAppId: build the scopeId for a bare app id.
export function appScopeId(appId: string): string {
  return `app:${appId}`;
}
