-- Normalize legacy avatar icon aliases to their raw Material-Design names.
-- The avatar primitive's CURATED_ALIASES layer (robot -> precision_manufacturing,
-- etc.) is being removed; the AvatarPicker has always stored raw MD names, so
-- only pre-migration agent rows still carry alias keys. Idempotent: each UPDATE
-- only touches rows still holding the alias. icon_svg_nodes already caches the
-- resolved SVG (same icon), so it needs no change.
UPDATE "agents" SET "icon" = 'precision_manufacturing' WHERE "icon" = 'robot';
UPDATE "agents" SET "icon" = 'bug_report'             WHERE "icon" = 'bug';
UPDATE "agents" SET "icon" = 'storage'                WHERE "icon" = 'database';
UPDATE "agents" SET "icon" = 'dns'                    WHERE "icon" = 'server';
UPDATE "agents" SET "icon" = 'data_object'            WHERE "icon" = 'data';
UPDATE "agents" SET "icon" = 'psychology'             WHERE "icon" = 'brain';
UPDATE "agents" SET "icon" = 'auto_awesome'           WHERE "icon" = 'sparkle';
UPDATE "agents" SET "icon" = 'local_fire_department'  WHERE "icon" = 'fire';
UPDATE "agents" SET "icon" = 'trending_up'            WHERE "icon" = 'trending';
UPDATE "agents" SET "icon" = 'music_note'             WHERE "icon" = 'music';
UPDATE "agents" SET "icon" = 'videocam'               WHERE "icon" = 'video';
UPDATE "agents" SET "icon" = 'emoji_objects'          WHERE "icon" = 'emoji';
UPDATE "agents" SET "icon" = 'description'            WHERE "icon" = 'doc';
UPDATE "agents" SET "icon" = 'grid_view'              WHERE "icon" = 'grid';
UPDATE "agents" SET "icon" = 'table_chart'            WHERE "icon" = 'table';
UPDATE "agents" SET "icon" = 'calendar_today'         WHERE "icon" = 'calendar';
UPDATE "agents" SET "icon" = 'access_time'            WHERE "icon" = 'clock';
UPDATE "agents" SET "icon" = 'manage_accounts'        WHERE "icon" = 'account';
UPDATE "agents" SET "icon" = 'language'               WHERE "icon" = 'globe';
UPDATE "agents" SET "icon" = 'play_arrow'             WHERE "icon" = 'play';
UPDATE "agents" SET "icon" = 'bar_chart'              WHERE "icon" = 'chart';
UPDATE "agents" SET "icon" = 'pie_chart'              WHERE "icon" = 'pie';
UPDATE "agents" SET "icon" = 'attach_money'           WHERE "icon" = 'currency';
