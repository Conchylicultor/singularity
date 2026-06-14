import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdGroupWork } from "react-icons/md";
import { BootSnapshot } from "@plugins/infra/plugins/boot-snapshot/web";
import { ConversationsView } from "@plugins/conversations/plugins/conversations-view/web";
import { conversationGroupsResource } from "../shared";
import { GroupedView } from "./components/grouped-view";

export default {
  description:
    "User-defined groups in the conversation sidebar list — drag a conversation onto another to create a group; drag onto a group to join.",
  contributions: [
    ConversationsView.View({
      id: "grouped",
      title: "Grouped",
      icon: MdGroupWork,
      order: 10,
      component: GroupedView,
    }),
    BootSnapshot.Hydrate({ descriptor: conversationGroupsResource }),
  ],
} satisfies PluginDefinition;
