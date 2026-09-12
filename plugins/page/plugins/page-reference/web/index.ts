import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PageReference } from "./internal/slots";

export {
  PageNavigationProvider,
  usePageNavigation,
  type PageNavigation,
} from "./internal/navigation";
export {
  PageReference,
  type PageReferenceActionProps,
  type PageReferenceChipProps,
  type PageReferenceDecorationContribution,
} from "./internal/slots";
export { usePageReferenceActions } from "./internal/actions";
export {
  usePageReferenceDecoration,
  usePageReferenceTint,
  type PageReferenceDecoration,
} from "./internal/decoration";

export default {
  description:
    "The shared contract for a reference to another page rendered inside a page (sub-page row, link block, inline mention): the PageNavigation context a host declares once so no callback is threaded through the composite block store, the PageReference.Actions frontier whose contributions become the reference row's hover actions, and the PageReference.Decoration seam through which a kind of page (read off its own data) tints its reference rows and adds a trailing chip. Owns no reference, no action and no decoration of its own.",
  contributions: [],
  slots: PageReference,
} satisfies PluginDefinition;
