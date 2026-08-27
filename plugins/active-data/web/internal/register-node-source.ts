import { registerNodeExtensionSource } from "@plugins/primitives/plugins/text-editor/web";
import { activeDataInlineExtension } from "./inline-extension";

// Side-effect: teach the prompt editor about active-data's inline chips, so a
// token renders as the same chip while composing as it does once sent.
//
// A SOURCE, not an extension: the chip set is itself a registry that fills in
// as the plugin tiers load, so what is registered here is the lookup, called
// afresh every time the editor asks. Registering a finished union instead would
// freeze whatever had loaded at this module's eval.
//
// `"transcript"` is the prompt editor's surface — a conversation draft. The
// page editor asks for `"document"` and gets a different union.
registerNodeExtensionSource(() => {
  const extension = activeDataInlineExtension("transcript");
  return extension ? [extension] : [];
});
