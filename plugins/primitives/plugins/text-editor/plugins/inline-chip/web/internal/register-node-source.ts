import { registerNodeExtensionSource } from "@plugins/primitives/plugins/text-editor/web";
import { inlineChipExtension } from "./inline-extension";

// Side-effect: teach every `TextEditor` about the inline chips, so a token
// renders as the same chip while composing as it does once sent.
//
// A SOURCE, not an extension: the chip set is itself a registry that fills in
// as the plugin tiers load, so what is registered here is the lookup, called
// afresh every time the editor asks. Registering a finished union instead would
// freeze whatever had loaded at this module's eval.
//
// `"transcript"` is the `TextEditor`'s surface — a draft addressed to an agent.
// The page editor asks for `"document"` (through active-data's bridge) and gets
// a different union.
registerNodeExtensionSource(() => {
  const extension = inlineChipExtension("transcript");
  return extension ? [extension] : [];
});
