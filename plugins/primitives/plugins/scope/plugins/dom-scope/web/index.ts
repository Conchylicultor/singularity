import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { defineDomScope } from "./internal/define-dom-scope";
export type {
  DomScopeApi,
  DomScopeHandle,
  DomScopeOptions,
  DomScopeRoot,
} from "./internal/define-dom-scope";

export default {
  description:
    "The DOM node that belongs to ONE mounted instance: defineDomScope declares a scope a descendant publishes its element into and a sibling reads, so a lookup never reaches past its own instance into another mounted copy of the same surface. A scoped store holding one element — install-sink's discipline (named throws, subscription-only render reads, peek… naming) with scoped-store's per-Provider lifetime. Readers get a { attached } union, never a nullable root, so 'not mounted yet' cannot be absorbed into 'no matches'; the declared bounds derive the check that bans document-wide lookups of those attributes.",
  contributions: [],
} satisfies PluginDefinition;
