import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  agentNotesAuthorsResource,
  type AgentNotesAuthor,
} from "../shared/schemas";

const NO_AUTHORS: readonly AgentNotesAuthor[] = [];

/**
 * The conversations that wrote into one agent-notes card, oldest-first.
 *
 * Sorted here rather than trusted from the loader's `ORDER BY`: a keyed resource
 * merges single-row deltas into the client's set by key, so array order after a
 * live update is the merge's, not the query's.
 *
 * Empty while the resource is still hydrating, which the caller renders exactly
 * as "no recorded author": a card whose provenance has not loaded and a card a
 * human typed by hand both have nothing to show, and a spinner in place of a
 * glyph would be noise on every card of the page. The consequence is that a
 * freshly-opened page's agent-notes glyph becomes interactive a beat after it
 * paints — the same call `useBlockPromptTasks` makes for its chips.
 */
export function useAgentNotesAuthors(blockId: string): readonly AgentNotesAuthor[] {
  const result = useResource(agentNotesAuthorsResource, { blockId });
  return useMemo(() => {
    if (result.pending) return NO_AUTHORS;
    return [...result.data].sort(
      (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
    );
  }, [result]);
}
