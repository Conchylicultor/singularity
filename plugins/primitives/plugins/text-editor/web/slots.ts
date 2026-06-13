import { type ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { getNodeExtensions, type NodeExtension } from "./internal/node-extensions";

export interface TextEditorPluginProps {
  onError?: (msg: string) => void;
}

export interface NodeExtensionSource {
  id: string;
  // A hook returning the node extensions this source contributes at runtime.
  // Called once per contribution in a fixed-order loop — the set never changes
  // after boot, so rules-of-hooks is satisfied. Lets a plugin mirror a
  // React-only registry (e.g. active-data's inline-tag slot) into the editor,
  // which the module-level registerNodeExtension can't reach.
  useExtensions: () => readonly NodeExtension[];
}

export const TextEditorSlots = {
  Plugin: defineRenderSlot<{
    component: ComponentType<TextEditorPluginProps>;
  }>("text-editor.plugin"),
  NodeExtensions: defineSlot<NodeExtensionSource>("text-editor.node-extensions"),
};

// Merges the static module-level extensions (registerNodeExtension) with the
// dynamic, runtime-resolved extensions contributed via the NodeExtensions slot.
// Must be called from inside the editor (React): slot contributions are only
// readable through hooks. Lets a plugin mirror a React-only registry (e.g.
// active-data's inline-tag slot) into the editor, which the module-level
// registry can't reach. Returns a fresh array each render — callers that need a
// stable identity should key on the node-type set (see TextEditor).
export function useMergedNodeExtensions(): readonly NodeExtension[] {
  const sources = TextEditorSlots.NodeExtensions.useContributions();
  // eslint-disable-next-line react-hooks/rules-of-hooks -- NodeExtensions contributions are static slot entries; count never changes after boot
  const dynamic = sources.flatMap((s) => s.useExtensions());
  return [...getNodeExtensions(), ...dynamic];
}
