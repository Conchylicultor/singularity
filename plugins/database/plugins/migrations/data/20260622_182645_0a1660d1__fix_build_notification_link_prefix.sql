-- Custom SQL migration file, put your code below! --
-- migration: 20260622_182645__fix_build_notification_link_prefix --

-- Build success/failure notifications were persisted with linkTo "/build/r/<id>",
-- missing the agent-manager app prefix (/agents). No registered app owns "/build",
-- so clicking them silently no-opped. The code now writes "/agents/build/r/<id>";
-- repair already-persisted rows so old build notifications navigate correctly
-- instead of resolving to no app (which now throws + files a crash report).
UPDATE notifications
SET link_to = '/agents' || link_to
WHERE link_to LIKE '/build/r/%';
