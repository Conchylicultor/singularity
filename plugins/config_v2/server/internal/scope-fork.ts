import { existsSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { computeHash, APP_SCOPE_DIR, scopeAppId } from "../../core";
import type { ConfigDescriptor, JsonValue } from "../../core";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import { jsoncConfigProxy } from "./jsonc-proxy";
import { userScopedDir } from "./scope-paths";
import { getScopedDescriptors, getDescriptorByStorePath, getHierarchyPath, configV2ScopeForkedServerResource } from "./resource";
import { ensureScopeEntry, getConfig, disposeScopeEntry, notifyDescriptorScopeChange } from "./registry";
import { hasFieldStorageProvider } from "./field-storage-providers";

// Fork ONE descriptor into a scope: snapshot its scope-effective value set into
// the scope's @app/<id> origin + override files (same content + hash → zero
// conflict at fork time), then build the scoped entry so it resolves live
// afterwards. Reading the SCOPE-effective value (not base) preserves any
// committed git scope for this app instead of resetting it to global.
// Provider-backed (secret) fields are stripped from the snapshot — we never
// write redacted secret values into JSONC.
async function forkDescriptor(descriptor: ConfigDescriptor, hierarchyPath: string, scopeId: string): Promise<void> {
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

// Whether a scope's config is backed by a committed git override
// (config/<hier>/@app/<id>/<name>.jsonc in the repo). Such a scope must survive
// un-forking — removal drops only the user's runtime override and falls back
// to the committed scope, not to base.
function gitBacksScope(hierarchyPath: string, scopeId: string, name: string): boolean {
  const appId = scopeAppId(scopeId);
  if (!appId) return false;
  return existsSync(join(REPO_ROOT, "config", hierarchyPath, APP_SCOPE_DIR, appId, `${name}.jsonc`));
}

// Un-fork ONE descriptor: drop the user's runtime scoped override. For a scope
// WITHOUT a committed git backing, also remove the propagated origin, dispose the
// entry, and rmdir the now-empty @app/<id> dir — the app reverts to tracking base
// live. For a git-backed scope, KEEP the propagated origin and rebuild the entry
// so the app falls back to its committed per-app config (not global); the next
// build re-propagates that origin regardless.
async function removeDescriptor(descriptor: ConfigDescriptor, hierarchyPath: string, scopeId: string): Promise<void> {
  const dir = userScopedDir(hierarchyPath, scopeId);
  const overridePath = join(dir, `${descriptor.name}.jsonc`);
  if (existsSync(overridePath)) unlinkSync(overridePath);

  if (gitBacksScope(hierarchyPath, scopeId, descriptor.name)) {
    // Rebuild from origin-only (override now gone) so getConfig resolves to the
    // committed scope rather than the stale cached override values.
    disposeScopeEntry(descriptor, scopeId);
    await ensureScopeEntry(descriptor, scopeId);
    return;
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

// Look up a descriptor + its hierarchyPath from a storePath, failing loudly when
// unregistered (a genuine bug, not a benign miss).
function resolveDescriptor(storePath: string): { descriptor: ConfigDescriptor; hierarchyPath: string } {
  const descriptor = getDescriptorByStorePath(storePath);
  if (!descriptor) throw new Error(`No descriptor for "${storePath}"`);
  const hierarchyPath = getHierarchyPath(descriptor);
  if (!hierarchyPath) {
    throw new Error(`[config-v2] descriptor "${descriptor.name}" has no registered hierarchy path.`);
  }
  return { descriptor, hierarchyPath };
}

// Fork a SINGLE descriptor into a new scope — bootstrap a brand-new per-app
// customization for one config. After this, the scoped setConfig path works for
// every subsequent edit. Notifies the scopes + conflicts + values + tiers
// resources for this storePath/scope.
export async function forkDescriptorScope(storePath: string, scopeId: string): Promise<void> {
  const { descriptor, hierarchyPath } = resolveDescriptor(storePath);
  await forkDescriptor(descriptor, hierarchyPath, scopeId);
  notifyDescriptorScopeChange(storePath, scopeId);
}

// Stop customizing a SINGLE descriptor for an app — the inverse of
// forkDescriptorScope. Distinct from delete-override (which only reverts edits to
// the scoped origin): this removes the scope's own config entirely (unless
// git-backed). Notifies the scopes resource for this storePath.
export async function removeDescriptorScope(storePath: string, scopeId: string): Promise<void> {
  const { descriptor, hierarchyPath } = resolveDescriptor(storePath);
  await removeDescriptor(descriptor, hierarchyPath, scopeId);
  notifyDescriptorScopeChange(storePath, scopeId);
}

// Fork all `scope: "app"` descriptors into a new scope, then notify the
// scope-level forked resource. Delegates each descriptor to forkDescriptor so the
// per-descriptor and scope-level paths never drift.
export async function forkScope(scopeId: string): Promise<void> {
  for (const { descriptor, hierarchyPath } of getScopedDescriptors("app")) {
    await forkDescriptor(descriptor, hierarchyPath, scopeId);
  }
  configV2ScopeForkedServerResource.notify({ scopeId });
}

// Un-fork all `scope: "app"` descriptors, then notify the scope-level forked
// resource. Delegates each descriptor to removeDescriptor.
export async function deleteScope(scopeId: string): Promise<void> {
  for (const { descriptor, hierarchyPath } of getScopedDescriptors("app")) {
    await removeDescriptor(descriptor, hierarchyPath, scopeId);
  }
  configV2ScopeForkedServerResource.notify({ scopeId });
}
