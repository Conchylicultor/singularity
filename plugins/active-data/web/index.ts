import type { PluginDefinition } from "@core";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import {
  useActiveDataTransform,
  useActiveDataCodeHandler,
} from "./internal/md-extension";

export { ActiveData } from "./slots";
export type { ActiveDataContribution, ActiveDataBlockContribution, ActiveDataInlineContribution } from "./slots";
export { useActiveDataSegments } from "./internal/segment-active-data";
export type { ActiveDataSegment } from "./internal/segment-active-data";
export { useActiveDataLinkify } from "./internal/linkify-active-data";
export {
  ActiveDataIdentityProvider,
  useActiveDataIdentity,
} from "./internal/identity-context";
export type { ActiveDataIdentity } from "./internal/identity-context";
export { useActiveDataBinding } from "./internal/use-active-data-binding";
export type { ActiveDataBindingHandle } from "./internal/use-active-data-binding";

export default {
  id: "active-data",
  name: "Active Data",
  description:
    "Meta plugin for inline interactive widgets agents render via XML-like tags in assistant text. Sub-plugins contribute inline (pattern) or block (tag) renderers; hosts use useActiveDataSegments() + useActiveDataLinkify().",
  contributions: [
    Markdown.Extension({
      id: "active-data-inline",
      priority: 100,
      useTransform: useActiveDataTransform,
      useCodeHandler: useActiveDataCodeHandler,
    }),
  ],
} satisfies PluginDefinition;
