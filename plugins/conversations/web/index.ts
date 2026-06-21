import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { BootSnapshot } from "@plugins/infra/plugins/boot-snapshot/web";
import { ConfigV2 } from "@plugins/config_v2/web";
import {
  conversationsActiveResource,
  conversationsSystemResource,
  conversationsGoneResource,
  conversationsGoneStatsResource,
} from "@plugins/tasks/plugins/tasks-core/core";
import { autoAnswerConfig } from "../shared/config";

export {
  useConversations,
  useConversation,
  useConversationById,
  useHasActiveSiblings,
  useHasActiveSiblingInWorktree,
  useActiveConversations,
  GonePageSchema,
} from "./use-conversations";
export type { ConversationsState } from "./use-conversations";
export default {
  collapsed: true,
  description: "Conversation domain: shared hooks and client-side API.",
  loadBearing: true,
  contributions: [
    ConfigV2.WebRegister({ descriptor: autoAnswerConfig }),
    BootSnapshot.Hydrate({ descriptor: conversationsActiveResource }),
    BootSnapshot.Hydrate({ descriptor: conversationsSystemResource }),
    BootSnapshot.Hydrate({ descriptor: conversationsGoneResource }),
    BootSnapshot.Hydrate({ descriptor: conversationsGoneStatsResource }),
  ],
} satisfies PluginDefinition;
