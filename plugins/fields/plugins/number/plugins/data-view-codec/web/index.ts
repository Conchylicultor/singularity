import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { numberCodec } from "./internal/codec";

export default {
  description:
    "Number field type: data-view custom-column value codec (native number ↔ canonical text).",
  contributions: [DataViewSlots.ValueCodec({ match: "number", codec: numberCodec })],
} satisfies PluginDefinition;
