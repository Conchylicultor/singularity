import { useContext } from "react";
import { PluginRuntimeContext } from "@plugins/framework/plugins/web-sdk/core";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import type { FieldsRecord } from "@plugins/fields/core";
import { storePathOf } from "./store-path";

// Resolve a descriptor's canonical storePath from its `ConfigV2.WebRegister`
// contribution — the same key `useConfig` and the server's storePath derive from
// (see store-path.ts). Throws loudly when the descriptor has no web registration,
// since every config read keys off this path. Factored out so `useConfig` and
// `useScopeMembership` share one resolution and can never key off divergent paths.
export function useStorePath<F extends FieldsRecord>(
  descriptor: ConfigDescriptor<F>,
): string {
  const ctx = useContext(PluginRuntimeContext);
  if (!ctx) throw new Error("config-v2 hooks must be inside PluginProvider");

  const registrations = ctx.bySlot.get("config-v2.web-register") ?? [];
  const reg = registrations.find((c) => c.descriptor === descriptor);
  const path = reg ? storePathOf(reg) : null;
  if (!path) {
    throw new Error(
      `[config-v2] descriptor "${descriptor.name}" has no web registration. ` +
        `Add ConfigV2.WebRegister({ descriptor }) to your plugin's web contributions.`,
    );
  }
  return path;
}
