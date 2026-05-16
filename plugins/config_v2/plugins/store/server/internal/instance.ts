import { CONFIG_DIR } from "@plugins/infra/plugins/paths/server";
import { JsoncConfigStore, createJsoncConfigStore } from "./jsonc-store";
import type { ConfigStore } from "../../core";

let instance: JsoncConfigStore | null = null;

export function getConfigStore(): ConfigStore {
  if (!instance) {
    throw new Error("[config-v2/store] not initialized — onReady has not run yet");
  }
  return instance;
}

export async function initConfigStore(): Promise<void> {
  instance = await createJsoncConfigStore(CONFIG_DIR);
}

export async function shutdownConfigStore(): Promise<void> {
  if (instance) {
    await instance.shutdown();
    instance = null;
  }
}
