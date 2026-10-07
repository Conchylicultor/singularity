import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { zipFormat } from "./internal/zip-format";

export default {
  description:
    "Zip as a host-fs archive format: a native reader of the zip central directory (zip64, UTF-8 / CP437 / Info-ZIP Unicode names, extended timestamps) registered through defineArchiveFormat, so a .zip browses like a folder — members stored or deflated, encrypted and other methods typed as unreadable.",
  register: [zipFormat],
} satisfies ServerPluginDefinition;
