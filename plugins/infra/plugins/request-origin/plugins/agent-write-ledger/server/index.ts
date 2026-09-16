import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { agentWrites, revertAgentWrites } from "../core";
import {
  handleAgentWrites,
  handleRevertAgentWrites,
} from "./internal/handlers";

export { defineAgentWriteLedger } from "./internal/ledger";
export type {
  AgentWriteLedger,
  AgentWriteLedgerEntry,
  AgentWriteLedgerOptions,
  FileSnapshot,
} from "./internal/ledger";

export default {
  description:
    "Shared agent-write ledger: defineAgentWriteLedger lets a domain snapshot the files an agent-origin request is about to overwrite (first write wins) and put them back on revert, skipping anything a person edited since; GET /api/agent-writes and POST /api/agent-writes/revert aggregate every registered ledger for the e2e harness.",
  httpRoutes: {
    [agentWrites.route]: handleAgentWrites,
    [revertAgentWrites.route]: handleRevertAgentWrites,
  },
} satisfies ServerPluginDefinition;
