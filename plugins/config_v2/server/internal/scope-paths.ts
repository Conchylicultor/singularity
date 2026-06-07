import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "./config-dir";

// Canonical base-scope key. "" means "no scope" — base/global config that lives
// exactly where it does today (no extra path segment).
export const BASE_SCOPE = "";

// Wire format for scopeId is "<kind>:<id>" (kind-prefixed, extensible). config_v2
// treats it as an opaque kind tag + path segment — it NEVER imports the apps
// plugin. Today the only kind is "app" → "@app/<appId>".
export function scopeSegment(scopeId?: string): string {
  if (!scopeId) return "";
  const [kind, ...rest] = scopeId.split(":");
  if (kind !== "app") throw new Error(`Unknown scope kind: ${kind}`);
  return `@app/${rest.join(":")}`;
}

// Absolute user-config directory for a descriptor at `hierarchyPath`, under the
// given scope. For base scope the segment is "" and join() leaves the path as-is,
// so base files stay exactly where they are today (zero migration).
export function userScopedDir(hierarchyPath: string, scopeId?: string): string {
  return join(CONFIG_DIR, hierarchyPath, scopeSegment(scopeId));
}

// Reverse of scopeSegment, for boot-time discovery: every scopeId that already
// has a config directory on disk under `hierarchyPath`. Keeps the "@app/<id>" →
// "app:<id>" encoding next to the forward mapping so the registry never hard-codes
// the path convention. A missing "@app" dir is the normal un-forked case → [].
export function discoverScopeIds(hierarchyPath: string): string[] {
  const appDir = join(CONFIG_DIR, hierarchyPath, "@app");
  if (!existsSync(appDir)) return [];
  return readdirSync(appDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `app:${e.name}`);
}
