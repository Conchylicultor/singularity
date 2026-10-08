import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
// Side-effect registration only: eagerly registers the boot-critical
// release.previews live value (see ./internal/register).
// The engine has no UI of its own — the Studio release app is the UI consumer.
import "./internal/register";
import { IdKinds } from "@plugins/ids/web";
import { releaseRunIdKind } from "@plugins/release/plugins/bundles/core";

export default {
  collapsed: true,
  description:
    "Release engine web presence: eagerly registers the boot-critical release.previews live value so boot-snapshot can hydrate it before first paint, independent of the (lazy) Studio release UI.",
  contributions: [IdKinds.Kind({ kind: releaseRunIdKind })],
} satisfies PluginDefinition;
