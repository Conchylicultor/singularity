import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  ActionPresentation,
  useActionPresentation,
  type ActionPresentationMode,
} from "./internal/context";
export {
  ActionPresenceScope,
  useReportActionPresence,
} from "./internal/presence";
export {
  MenuActionItem,
  type MenuActionItemProps,
} from "./components/menu-action-item";

export default {
  description:
    "Presentation mode for generic {icon,label,onClick} actions: a region declares itself inline, menu or probe via <ActionPresentation>, and the action component reads it with useActionPresentation() — so an opaque action renders as a ghost icon button on a row and as a labelled MenuActionItem inside a dropdown, with no change at the call site. The probe mode draws nothing and only counts itself into the surrounding ActionPresenceScope, so a region can tell whether its action set is empty for a given row before painting chrome for it.",
  contributions: [],
} satisfies PluginDefinition;
