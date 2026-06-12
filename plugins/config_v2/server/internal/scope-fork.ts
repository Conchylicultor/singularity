import { existsSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { computeHash, APP_SCOPE_DIR, scopeAppId } from "../../core";
import type { JsonValue } from "../../core";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import { jsoncConfigProxy } from "./jsonc-proxy";
import { userScopedDir } from "./scope-paths";
import { getScopedDescriptors, configV2ScopeForkedServerResource } from "./resource";
import { ensureScopeEntry, getConfig, disposeScopeEntry } from "./registry";
import { hasFieldStorageProvider } from "./field-storage-providers";

// Fork all `scope: "app"` descriptors into a new scope: snapshot each
// scope-effective value set into the scope's @app/<id> origin + override files
// (same content + hash → zero conflict at fork time), then build the scoped entry
// so it resolves live afterwards. Reading the SCOPE-effective value (not base)
// preserves any committed git scope for this app instead of resetting it to
// global. Provider-backed (secret) fields are stripped from the snapshot — we
// never write redacted secret values into JSONC.
export async function forkScope(scopeId: string): Promise<void> {
  for (const { descriptor, hierarchyPath } of getScopedDescriptors("app")) {
    const resolved = getConfig(descriptor, scopeId) as Record<string, unknown>;
    const snapshot: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(descriptor.fields)) {
      if (hasFieldStorageProvider(field.type.id)) continue;
      snapshot[key] = resolved[key];
    }

    const dir = userScopedDir(hierarchyPath, scopeId);
    const hash = computeHash(snapshot as JsonValue);
    jsoncConfigProxy(join(dir, `${descriptor.name}.origin.jsonc`)).write(snapshot as JsonValue, hash);
    jsoncConfigProxy(join(dir, `${descriptor.name}.jsonc`)).write(snapshot as JsonValue, hash);

    await ensureScopeEntry(descriptor, scopeId);
  }
  configV2ScopeForkedServerResource.notify({ scopeId });
}

// Whether a scope's config is backed by a committed git override
// (config/<hier>/@app/<id>/<name>.jsonc in the repo). Such a scope must survive
// un-forking — deleteScope drops only the user's runtime override and falls back
// to the committed scope, not to base.
function gitBacksScope(hierarchyPath: string, scopeId: string, name: string): boolean {
  const appId = scopeAppId(scopeId);
  if (!appId) return false;
  return existsSync(join(REPO_ROOT, "config", hierarchyPath, APP_SCOPE_DIR, appId, `${name}.jsonc`));
}

// Un-fork: drop the user's runtime scoped override. For a scope WITHOUT a
// committed git backing, also remove the propagated origin, dispose the entry,
// and rmdir the now-empty @app/<id> dir — the app reverts to tracking base live.
// For a git-backed scope, KEEP the propagated origin and rebuild the entry so the
// app falls back to its committed per-app config (not global); the next build
// re-propagates that origin regardless.
export async function deleteScope(scopeId: string): Promise<void> {
  for (const { descriptor, hierarchyPath } of getScopedDescriptors("app")) {
    const dir = userScopedDir(hierarchyPath, scopeId);
    const overridePath = join(dir, `${descriptor.name}.jsonc`);
    if (existsSync(overridePath)) unlinkSync(overridePath);

    if (gitBacksScope(hierarchyPath, scopeId, descriptor.name)) {
      // Rebuild from origin-only (override now gone) so getConfig resolves to the
      // committed scope rather than the stale cached override values.
      disposeScopeEntry(descriptor, scopeId);
      await ensureScopeEntry(descriptor, scopeId);
      continue;
    }

    const originPath = join(dir, `${descriptor.name}.origin.jsonc`);
    if (existsSync(originPath)) unlinkSync(originPath);
    disposeScopeEntry(descriptor, scopeId);
    if (existsSync(dir)) {
      try {
        rmdirSync(dir);
      } catch (err) {
        // Dir not empty (another descriptor still has files there, or it's being
        // cleaned by a concurrent op) — leave it. Anything else is unexpected.
        if ((err as NodeJS.ErrnoException).code !== "ENOTEMPTY") throw err;
      }
    }
  }
  configV2ScopeForkedServerResource.notify({ scopeId });
}
