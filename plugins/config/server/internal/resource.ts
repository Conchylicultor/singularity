import { defineResource } from "@server/resources";
import { getAll } from "./read-cache";

// Single push resource holding all config values, keyed by fullKey
// ("<pluginId>.<fieldName>"). Small payload (< ~4KB for dozens of fields)
// and rarely mutated — push is the right mode.
export const configResource = defineResource<Record<string, unknown>>({
  key: "config",
  mode: "push",
  async loader() {
    const map = await getAll();
    return Object.fromEntries(map);
  },
});
