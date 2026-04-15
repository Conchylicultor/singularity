import type { ServerPluginDefinition } from "../../../../../server/src/types";
import {
  Runtime,
  type ConversationRuntime,
  type RuntimeInfo,
} from "@plugins/conversations/server/api";

const apiRuntime: ConversationRuntime = {
  id: "api",
  async list(): Promise<Map<string, RuntimeInfo>> {
    return new Map();
  },
  async create(
    _conversationId: string,
    _worktreePath: string,
    _opts?: { prompt?: string },
  ): Promise<void> {
    throw new Error("api runtime: create() not implemented");
  },
  async delete(): Promise<void> {
    throw new Error("api runtime: delete() not implemented");
  },
};

Runtime.register(apiRuntime);

const plugin: ServerPluginDefinition = {
  id: "conversations-runtime-api",
  name: "Conversations Runtime: api",
  description:
    "Stub placeholder for running Claude via the Anthropic Agent SDK (not yet implemented).",
};
export default plugin;
