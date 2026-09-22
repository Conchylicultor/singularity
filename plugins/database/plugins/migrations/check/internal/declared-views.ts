import { existsSync } from "fs";
import { join, relative } from "path";
import { asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import type { ServerContribution } from "@plugins/framework/plugins/server-core/core";
import {
  registerBarrelStubs,
  importBarrel,
} from "@plugins/plugin-meta/plugins/barrel-import/core";
import { buildRegistryGenContext } from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import {
  View,
  type DeclaredView,
} from "@plugins/database/plugins/derived-views/server";

export type DeclaredViewsResult =
  { ok: true; views: DeclaredView[] } | { ok: false; message: string };

// The derived views main's next boot would rebuild, read from this checkout's
// server barrels. A booted backend gets this set from `View.getContributions()`;
// a check process never boots, so it imports the barrels itself and reads each
// definition's `contributions` — the same walk `config_v2`'s
// `registrations-paired` check does. Only plugins in main's composition closure
// count: a plugin main does not bundle contributes no view on main.
export async function declaredViews(
  root: string,
): Promise<DeclaredViewsResult> {
  const ctx = await buildRegistryGenContext(root);
  registerBarrelStubs(root);

  const definitions: { contributions?: readonly ServerContribution[] }[] = [];
  for (const node of ctx.tree.byDir.values()) {
    if (!ctx.mainBundle.has(asPluginId(node.id))) continue;
    const serverIndex = join(node.dir, "server", "index.ts");
    if (!existsSync(serverIndex)) continue;
    let mod: Record<string, unknown>;
    try {
      mod = await importBarrel(serverIndex);
    } catch (err) {
      return {
        ok: false,
        message: `Failed to import server barrel ${relative(root, serverIndex)}: ${String(err)}`,
      };
    }
    const def = mod.default as
      { contributions?: readonly ServerContribution[] } | undefined;
    if (def) definitions.push(def);
  }
  return { ok: true, views: View.from(definitions) };
}
