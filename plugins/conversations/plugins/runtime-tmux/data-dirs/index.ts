import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The tmux signal directory: one empty file per tmux session name, touched as a
 * wake-up whenever something happens to that session that no other file says —
 * the global tmux hooks (session created / closed, pane exited) and the agent's
 * own Claude Code hooks (an AskUserQuestion menu opening or closing, a prompt
 * submitted). Every backend watches it and reconciles the named conversation.
 *
 * Host-global because tmux is: one server per machine, whose hooks fire for
 * every worktree's sessions. A file's content means nothing — only that it was
 * touched — so nothing is lost by deleting one; the status sweep prunes files
 * untouched for a day.
 */
export const tmuxSignalsDir = defineDataDir({
  kind: "state",
  name: "tmux-signals",
  owner: "conversations/runtime-tmux",
  description:
    "Empty wake-up files, one per tmux session name, touched by tmux and Claude Code hooks so the conversation status reconciler re-reads that session",
  reclaim: { kind: "ttl", ttlDays: 1 },
});

export default [tmuxSignalsDir];
