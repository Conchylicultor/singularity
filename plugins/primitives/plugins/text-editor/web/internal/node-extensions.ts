import {
  createSourcedRegistry,
  tokenExtension,
  type InlineTokenExtension,
  type InlineTokenNodeRef,
} from "@plugins/primitives/plugins/text-editor/plugins/token-extension/core";

/**
 * An inline token family this editor knows about.
 *
 * This editor's name for the shared {@link InlineTokenExtension}: one type,
 * one line scan and one (de)serialization derivation across every Lexical host
 * in the app. The trio that used to be written by hand here — `serializeNode`,
 * `deserializePattern`, `createNodeFromMatch` — is derived from the node
 * declaration, so a serializer that disagrees with its parser is unspellable.
 */
export type NodeExtension = InlineTokenExtension;

const registry = createSourcedRegistry<NodeExtension>();

/**
 * Register an inline token family. Returns its unregister.
 *
 * Takes the field-erased {@link InlineTokenNodeRef}, which every family's typed
 * `InlineTokenNode<F>` already is — so a contributor passes its own descriptor
 * straight in and the registry stores one type, with no cast between them.
 */
export function registerNodeExtension(spec: {
  id: string;
  node: InlineTokenNodeRef;
  pattern: RegExp;
}): () => void {
  return registry.register(tokenExtension(spec));
}

/**
 * Register a LOOKUP for a set of families that is not yet knowable — the escape
 * hatch for a plugin whose token set is itself a registry (active-data's inline
 * chips, which register progressively as the plugin tiers load).
 *
 * This replaced a `NodeExtensions` SLOT, whose contributions could only be read
 * through a React hook. That confined the editor's extension set to render, and
 * mirroring the same idea into the page editor was impossible — its registry
 * readers are headless. A source is readable from both.
 */
export function registerNodeExtensionSource(
  source: () => readonly NodeExtension[],
): () => void {
  return registry.registerSource(source);
}

/**
 * Every registered family, sources expanded.
 *
 * Read at CALL time, never memoized: extensions and sources register during
 * plugin load, and a snapshot taken too early silently under-reports — the
 * token then renders as plain characters with nothing failing.
 */
export function getNodeExtensions(): readonly NodeExtension[] {
  return registry.all();
}
