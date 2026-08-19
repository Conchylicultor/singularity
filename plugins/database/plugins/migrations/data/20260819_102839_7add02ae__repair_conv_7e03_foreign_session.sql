-- Custom SQL migration file, put your code below! --
-- migration: 20260819_102839__repair_conv_7e03_foreign_session --

-- 2026-08-19: one conversation's chain carries another conversation's session.
--
-- Session id 2bf76e71-986e-4818-9dde-403eca397bfc genuinely belongs to
-- conv-1787096859-nhi0 (worktree att-1787096858-0t1l). A resolver bug in
-- runtime-tmux — it kept the FRESHEST sessions file in a pane's process
-- subtree, and the machine-wide Claude daemon lends pre-warmed spare processes
-- into unrelated panes' subtrees — also appended it to conv-1786969506-7e03's
-- chain (worktree att-1786969505-xoj5) and wrote it into that conversation's
-- claude_session_id. There it hijacked the rendered transcript,
-- `rewindLastUserTurn` (the Stop button truncated the OTHER conversation's live
-- file), `claude --resume`, retention's utimes sweep and the backup copy.
--
-- The resolver now requires a record to CLAIM the pane, so nothing new can be
-- adopted this way. This repairs what the old rule already wrote.
--
-- Design: research/2026-08-19-global-pane-session-ownership.md
--
-- Scope: both statements are keyed on conv-1786969506-7e03 alone.
-- conv-1787096859-nhi0's own rows for this session id are CORRECT and must not
-- be touched — which is why neither statement matches on the session id by
-- itself. On every other database (a fresh fork, another user's install) both
-- match zero rows and this migration is a no-op.

-- 1. Drop the foreign chain entry.
--
-- Necessary even though the read path now refuses it (it resolves outside the
-- conversation's own ~/.claude/projects directory, so `resolveAnchoredChain`
-- drops it) and even though the poller re-adopts the correct id on its next
-- tick. `conversation_sessions` is append-only: `recordSessionId` has no UPDATE
-- path, and its INSERT ... ON CONFLICT DO NOTHING cannot move an existing row's
-- `seen_at`. So without this DELETE the foreign entry stays the chain's TAIL
-- forever, and every reader has to keep defending against it.
DELETE FROM "conversation_sessions"
WHERE "conversation_id" = 'conv-1786969506-7e03'
  AND "claude_session_id" = '2bf76e71-986e-4818-9dde-403eca397bfc';

-- 2. Restore the live tail.
--
-- baf9c302 is the parked background job this pane really is running — the
-- resolver reached it correctly at 23:51 on 2026-08-18 by following the stub's
-- parkedJobId pointer, and was then overtaken by the lent spare's mtime.
--
-- Guarded on the currently-wrong value, so this is a no-op if the deployed
-- poller has already self-healed the column, or has since legitimately moved it
-- on to a newer session.
UPDATE "conversations"
SET "claude_session_id" = 'baf9c302-68bf-49c6-9f6b-cd58a290b209'
WHERE "id" = 'conv-1786969506-7e03'
  AND "claude_session_id" = '2bf76e71-986e-4818-9dde-403eca397bfc';
