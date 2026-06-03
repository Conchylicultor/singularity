import { existsSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { computeHash } from "../../core";
import type { JsonValue } from "../../core";
import { jsoncConfigProxy } from "./jsonc-proxy";
import { userScopedDir } from "./scope-paths";
import { getScopedDescriptors, configV2ScopeForkedServerResource } from "./resource";
import { ensureScopeEntry, getConfig, disposeScopeEntry } from "./registry";
import { hasFieldStorageProvider } from "./field-storage-providers";

// Fork all `scope: "app"` descriptors into a new scope: snapshot each base
// resolved value set into the scope's @app/<id> origin + override files (same
// content + hash → zero conflict at fork time), then build the scoped entry so it
// resolves live afterwards. Provider-backed (secret) fields are stripped from the
// snapshot — we never write redacted secret values into JSONC.
export async function forkScope(scopeId: string): Promise<void> {
  for (const { descriptor, hierarchyPath } of getScopedDescriptors("app")) {
    const resolved = getConfig(descriptor, "") as Record<string, unknown>;
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

// Un-fork: remove the scope's @app/<id> files, dispose its entry, and rmdir the
// now-empty @app/<id> dir. The app reverts to tracking base live.
export function deleteScope(scopeId: string): void {
  for (const { descriptor, hierarchyPath } of getScopedDescriptors("app")) {
    const dir = userScopedDir(hierarchyPath, scopeId);
    for (const file of [`${descriptor.name}.jsonc`, `${descriptor.name}.origin.jsonc`]) {
      const p = join(dir, file);
      if (existsSync(p)) unlinkSync(p);
    }
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
