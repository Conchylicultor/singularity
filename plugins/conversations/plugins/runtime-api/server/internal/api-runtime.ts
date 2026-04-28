import {
  Runtime,
  type ConversationRuntime,
  type RuntimeInfo,
} from "@plugins/conversations/server";

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
  async send(): Promise<void> {
    throw new Error("api runtime: send() not implemented");
  },
  async interrupt(): Promise<void> {
    throw new Error("api runtime: interrupt() not implemented");
  },
};

Runtime.register(apiRuntime);
