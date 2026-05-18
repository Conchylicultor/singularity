import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { z } from "zod";
import { getAll } from "./read-cache";

// Single push resource holding all config values, keyed by fullKey
// ("<pluginId>.<fieldName>"). Small payload (< ~4KB for dozens of fields)
// and rarely mutated — push is the right mode.
export const configResource = defineResource<Record<string, unknown>>({
  key: "config",
  mode: "push",
  schema: z.record(z.unknown()),
  async loader() {
    const map = await getAll();
    return Object.fromEntries(map);
  },
});
