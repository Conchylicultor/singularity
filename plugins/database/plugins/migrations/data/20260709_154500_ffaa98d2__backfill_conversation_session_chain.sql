-- Custom SQL migration file, put your code below! --
-- migration: 20260709_154500__backfill_conversation_session_chain --

-- Seed `conversation_sessions` for conversations that predate the chain table.
--
-- The chain is an append-only record of every Claude session id a conversation
-- has run under, written by the poller as it observes each change. Rows created
-- before the table existed have no chain, and the poller only appends when it
-- sees a CHANGE on a live pane — so a conversation it never revisits (already
-- `done`, pane reaped, or simply never changing again) would never get one.
--
-- Ordering note: `seen_at` is what orders a chain, and its DB default is `now()`
-- — which Postgres evaluates at TRANSACTION START. A migration is one
-- transaction, so every row inserted here would otherwise share an identical
-- `seen_at` and scramble the order. Both statements below therefore supply
-- `seen_at` explicitly.

-- 1. The one conversation whose history we can actually recover.
--
-- `conv-1783448623-h424` ran under three sessions. The middle one (`fcd9c7bc`)
-- is a dead session the poller can never observe live, so only a hand-seeded
-- chain restores it. The timestamps are each session's first transcript line
-- (`4a4671db`, `af01a393`) or its first self-authored line (`fcd9c7bc`, which
-- forked and copied its ancestor's lines verbatim).
--
-- `WHERE EXISTS` scopes this to the database that actually holds the row: every
-- worktree runs the same migrations against its own DB fork, and this is a
-- statement about one conversation, not about the schema.
INSERT INTO "conversation_sessions" ("id", "conversation_id", "claude_session_id", "seen_at")
SELECT
  gen_random_uuid()::text,
  'conv-1783448623-h424',
  v."claude_session_id",
  v."seen_at"::timestamptz
FROM (VALUES
  ('4a4671db-af80-48b4-bae5-0a709270a800', '2026-07-07T18:24:38.853Z'),
  ('fcd9c7bc-cf12-4ee8-a64d-beb458f7c169', '2026-07-08T14:19:05.235Z'),
  ('af01a393-119a-4ab9-9f59-5a82ef22a812', '2026-07-08T22:54:58.495Z')
) AS v("claude_session_id", "seen_at")
WHERE EXISTS (
  SELECT 1 FROM "conversations" WHERE "id" = 'conv-1783448623-h424'
)
ON CONFLICT ("conversation_id", "claude_session_id") DO NOTHING;

-- 2. Every other conversation: seed the chain with the session id it already
-- points at. This is a floor, not a history — a conversation that silently
-- moved to a new session before this migration keeps only the segment the old
-- single-file read path could already see. `created_at` is the honest
-- first-seen approximation, and is distinct per conversation.
--
-- ON CONFLICT DO NOTHING makes this idempotent and keeps statement 1's exact
-- timestamp for `4a4671db` rather than overwriting it with `created_at`.
INSERT INTO "conversation_sessions" ("id", "conversation_id", "claude_session_id", "seen_at")
SELECT
  gen_random_uuid()::text,
  c."id",
  c."claude_session_id",
  c."created_at"
FROM "conversations" c
WHERE c."claude_session_id" IS NOT NULL
ON CONFLICT ("conversation_id", "claude_session_id") DO NOTHING;
