import { join } from "node:path";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { refHeadResource } from "@plugins/infra/plugins/git-watcher/server";
import {
  editedFilesResource,
  getEditedFiles,
} from "@plugins/conversations/plugins/conversation-view/plugins/code/server";
import { getConversation } from "@plugins/tasks/plugins/tasks-core/server";
import { PluginChangesSchema, type PluginChangesResponse } from "../../core/protocol";
import { computePluginChanges } from "./compute-plugin-diff";
import { getMainPluginsDir } from "./main-plugins-dir";
import { getMainPluginTree, getWorktreePluginTree } from "./plugin-tree-cache";

type Params = { conversationId: string };

// ConversationIds with a live review-pane subscriber, tracked per resource via
// the sub-lifecycle hooks. A git ref advance (local commit / rebase /
// sync-to-head, or main moving) changes the worktree-vs-main plugin diff of
// every visible review, so any refHeadResource notify fans out to exactly the
// conversations currently on screen. git-watcher only tracks `main` + this
// worktree's own branch, so a notify already implies a relevant ref moved — no
// need to inspect the refName (same reasoning as commits-graph).
const activeConversations = new Set<string>();

function activeConversationParams(active: ReadonlySet<string>): () => Params[] {
  return () => [...active].map((conversationId) => ({ conversationId }));
}

async function computeWorktreePluginChanges(conversationId: string): Promise<PluginChangesResponse> {
  const conversation = await getConversation(conversationId);
  if (!conversation?.worktreePath) return { plugins: [] };

  const [editedFiles, mainPluginsDir] = await Promise.all([
    getEditedFiles(conversation.worktreePath),
    getMainPluginsDir(),
  ]);

  const worktreePluginsDir = join(conversation.worktreePath, "plugins");
  // Each side is memoized on its own cheap signature (main → main sha, worktree
  // → edited-files content signature) and owns its withHeavyReadSlot internally, so an
  // unchanged side is a pure hit that takes no slot. Steady-state recomputes
  // rebuild at most one tree.
  const [worktreeTree, mainTree] = await Promise.all([
    getWorktreePluginTree(conversation.worktreePath, worktreePluginsDir),
    getMainPluginTree(mainPluginsDir),
  ]);
  const plugins = computePluginChanges(worktreeTree, mainTree, editedFiles);
  return { plugins };
}

export const pluginChangesResource = defineResource({
  key: "review.plugin-changes",
  mode: "push",
  schema: PluginChangesSchema,
  // Coalesce rapid-fire git changes (frequent agent commits) — the heavy
  // buildPluginTree compute only needs to run once the ref settles, not on every
  // individual commit arriving in a burst.
  debounceMs: 3000,
  dependsOn: [
    // worktree file edits → edited-files resource is keyed { id: conversationId }
    { resource: editedFilesResource, map: (p: { id: string }) => [{ conversationId: p.id }] },
    // main / own-branch advance → fan out to active subscribers only
    { resource: refHeadResource, map: activeConversationParams(activeConversations) },
  ],
  onFirstSubscribe: ({ conversationId }: Params) => {
    activeConversations.add(conversationId);
  },
  onLastUnsubscribe: ({ conversationId }: Params) => {
    activeConversations.delete(conversationId);
  },
  loader: async ({ conversationId }: Params): Promise<PluginChangesResponse> =>
    computeWorktreePluginChanges(conversationId),
});
