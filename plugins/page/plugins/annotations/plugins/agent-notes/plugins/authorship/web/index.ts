import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useAgentNotesAuthors, useAgentNotesCreator } from "./hooks";
export { AgentNotesAuthors } from "./components/agent-notes-authors";
export type { AgentNotesAuthor } from "../shared/schemas";

export default {
  description:
    "Reads an agent-authored block's authorship (useAgentNotesAuthors, and useAgentNotesCreator for the first writer) and renders it as the card's provenance popover — one row per contributing conversation, opening the conversation that wrote it. Contributes no slot of its own; the agent-notes anchor hosts it.",
} satisfies PluginDefinition;
