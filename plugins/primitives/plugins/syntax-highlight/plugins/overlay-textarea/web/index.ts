import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  OverlayTextarea,
  type OverlayTextareaProps,
} from "./internal/overlay-textarea";

export default {
  description:
    "Editable highlighted text: <OverlayTextarea> lays a transparent textarea (visible caret) exactly over an underlay <pre> rendering decorate(value), which sizes the box so the field grows as you type. Both layers share one metrics class, so glyphs, wrapping and the caret stay aligned.",
  contributions: [],
} satisfies PluginDefinition;
