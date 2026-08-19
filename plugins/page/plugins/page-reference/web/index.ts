import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PageReference } from "./internal/slots";

export {
  PageNavigationProvider,
  usePageNavigation,
  type PageNavigation,
} from "./internal/navigation";
export { PageReference, type PageReferenceActionProps } from "./internal/slots";
export { usePageReferenceActions } from "./internal/actions";

export default {
  description:
    "The shared contract for a reference to another page rendered inside a page (sub-page row, link block, inline mention): the PageNavigation context a host declares once so no callback is threaded through the composite block store, and the PageReference.Actions frontier whose contributions become the reference row's hover actions. Owns no reference and no action of its own.",
  contributions: [],
  slots: [PageReference],
} satisfies PluginDefinition;
