import { defineConfig } from "@plugins/config_v2/core";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { variantField } from "@plugins/fields/plugins/variant/plugins/config/core";

/**
 * The ONE `views` config descriptor instance per consumer `storageKey`.
 *
 * A consumer's named view-instances (Notion-style "Cards / All / Board") live in
 * a per-consumer config_v2 `views` list — a git-committable, per-app-scopable
 * list of `{ name, view }` rows. Each row's `view` is the polymorphic `variant`
 * field: its value is `{ type, ...options }`, the discriminant `type` selecting
 * the view-type and the rest carrying that type's saved options. Storage is
 * opaque/passthrough at the config boundary (the variant field validates only
 * `type`); per-type validation of the options blob happens downstream on the web
 * against the chosen view-type's schema (this shared module is server-imported
 * and carries no per-type registry — that is injected by data-view's own UI).
 *
 * `useConfig`/`useSetConfig` match a config registration by descriptor
 * **reference identity** (`reg.descriptor === descriptor`), so the descriptor
 * passed to `ConfigV2.WebRegister` and the one later read via `useConfig` MUST be
 * the same object. This module-level cache builds-once-and-reuses per storageKey
 * — exactly the `reorder/web/internal/descriptors.ts` precedent. (Reference
 * stability only matters within a runtime; the server's identity is independent.)
 *
 * Plugin-private (`shared/`): only data-view's own web + server barrels import
 * this. The server build pulls no web code — `variantField` is called without its
 * web-only `useVariants` registry, so the descriptor stays server-safe.
 */
const cache = new Map<string, ConfigDescriptor>();

export function viewsDescriptor(storageKey: string): ConfigDescriptor {
  let descriptor = cache.get(storageKey);
  if (!descriptor) {
    descriptor = defineConfig({
      name: "views",
      promotableToGit: true,
      scope: "app",
      source: "view",
      fields: {
        views: listField({
          label: "Views",
          itemFields: {
            name: textField({ label: "Name" }),
            view: variantField({ label: "View" }),
          },
        }),
      },
    });
    cache.set(storageKey, descriptor);
  }
  return descriptor;
}
