-- Custom SQL migration file, put your code below! --
-- migration: 20261009_120003__rewrite_mail_ids --

-- Phase 4 of the unified prefixed ids (`plugins/ids`,
-- research/2026-10-07-global-unified-prefixed-ids.md §4): rows minted as BARE
-- uuids get their kind's prefix — `<uuid>` → `<prefix>-<uuid>`, which the
-- kind's generic recognition body accepts, and which its `legacyBareUuid`
-- `key` / `parse` upgrade an old bare-uuid URL to.
--
-- IDEMPOTENT and FORK-SAFE: every statement touches only values that are still
-- a bare uuid (`~ '^<uuid>$'`), so a re-run, or a worktree fork taken after
-- main applied this, is a no-op — and hand-made ids (`seed-…`) are never
-- touched. Child FK columns follow through ON UPDATE CASCADE (phase 3, already
-- on main); soft refs (no FK) are rewritten explicitly below.

-- Soft ref (no FK): an outbox operation's polymorphic target, rewritten only
-- where it names a rewritten kind (a local draft); a Gmail message / thread
-- target is Gmail's own id and stays as is. Before the drafts themselves, so
-- the join still sees their bare ids.
UPDATE mail_outbox o SET target_id = 'maildraft-' || o.target_id
  WHERE o.target_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (SELECT 1 FROM mail_drafts d WHERE d.id = o.target_id);

-- Accounts: cascades to every mirror table's `account_id` (sync state,
-- labels, threads, messages, attachments, drafts, outbox).
UPDATE mail_accounts SET id = 'mailacct-' || id WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
-- Attachment metadata rows: nothing references them.
UPDATE mail_attachments SET id = 'mailatt-' || id WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
-- Drafts: cascades to the draft↔attachment link (`mail_drafts_attachments`).
UPDATE mail_drafts SET id = 'maildraft-' || id WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
UPDATE mail_outbox SET id = 'mailout-' || id WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
