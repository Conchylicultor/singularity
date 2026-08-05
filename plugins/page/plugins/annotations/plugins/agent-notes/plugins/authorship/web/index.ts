import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useAgentNotesAuthors } from "./hooks";
export { AgentNotesAuthors } from "./components/agent-notes-authors";
export type { AgentNotesAuthor } from "../shared/schemas";

export default {
  description:
    "Reads an agent-notes card's authorship (useAgentNotesAuthors) and renders it as the card's provenance popover — one row per contributing conversation, opening the conversation that wrote it. Contributes no slot of its own; the agent-notes anchor hosts it.",
} satisfies PluginDefinition;
