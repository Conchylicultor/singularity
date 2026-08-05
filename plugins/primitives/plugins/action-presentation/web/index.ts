import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  ActionPresentation,
  useActionPresentation,
  type ActionPresentationMode,
} from "./internal/context";
export {
  MenuActionItem,
  type MenuActionItemProps,
} from "./components/menu-action-item";

export default {
  description:
    "Presentation mode for generic {icon,label,onClick} actions: a region declares itself inline or menu via <ActionPresentation>, and the action component reads it with useActionPresentation() — so an opaque action renders as a ghost icon button on a row and as a labelled MenuActionItem inside a dropdown, with no change at the call site.",
  contributions: [],
} satisfies PluginDefinition;
