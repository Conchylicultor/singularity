import { useContext, useCallback } from "react";
import { PluginRuntimeContext } from "@plugins/framework/plugins/web-sdk/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { setConfigField } from "../../core";
import type { ConfigDescriptor, FieldsRecord } from "../../core";
import { storePathOf } from "./store-path";

export function useSetConfig<F extends FieldsRecord>(
  descriptor: ConfigDescriptor<F>,
  opts?: { scopeId?: string },
): (key: keyof F & string, value: unknown) => void {
  const ctx = useContext(PluginRuntimeContext);
  if (!ctx) throw new Error("useSetConfig must be inside PluginProvider");

  const registrations = ctx.bySlot.get("config-v2.web-register") ?? [];
  const reg = registrations.find((c) => c.descriptor === descriptor);
  const storePath = reg ? storePathOf(reg) : null;

  if (!storePath) {
    throw new Error(
      `[config-v2] useSetConfig: descriptor "${descriptor.name}" has no web registration. ` +
        `Add ConfigV2.WebRegister({ descriptor }) to your plugin's web contributions.`,
    );
  }

  const scopeId = opts?.scopeId;

  return useCallback(
    (key: keyof F & string, value: unknown) => {
      void fetchEndpoint(
        setConfigField,
        {},
        { body: scopeId ? { storePath, key, value, scopeId } : { storePath, key, value } },
      );
    },
    [storePath, scopeId],
  );
}
