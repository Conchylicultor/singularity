-- Custom SQL migration file, put your code below! --
-- migration: 20260607_175536__wipe_page_data --
-- Destructive recreate for the page documents↔blocks unification.
-- Must run BEFORE the unify_page_documents_blocks schema migration: page_links
-- gains NOT NULL columns, so existing rows must be cleared first. page_blocks
-- cascades to its image attachments; page_documents rows are removed by the
-- schema migration's DROP TABLE.
DELETE FROM page_links;
--> statement-breakpoint
DELETE FROM page_blocks;
