import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { defineFileSink, getFileSinks, openDynamicSink } from "./internal/file-sink";

export default {
  description:
    "Bounded-append file sink primitive: defineFileSink declares an absolute-path sink that rotates at a byte cap (default 128 MB × 3), true by construction because append() IS the rotation. Node-only (no db/jobs) so a CLI process can import it. getFileSinks exposes the registered set; openDynamicSink covers the open-ended browser clientLog family under one declared bound.",
} satisfies ServerPluginDefinition;
