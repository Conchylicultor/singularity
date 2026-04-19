-- Drop views that depend on rank columns before altering their type.
-- Views are recreated below with identical definitions.
DROP VIEW IF EXISTS "tasks_v";--> statement-breakpoint
DROP VIEW IF EXISTS "agents_v";--> statement-breakpoint

ALTER TABLE "tasks" ALTER COLUMN "rank" SET DATA TYPE TEXT COLLATE "C";--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "rank" SET DATA TYPE TEXT COLLATE "C";--> statement-breakpoint

-- Recreate agents_v
CREATE VIEW "agents_v" AS
  SELECT id, parent_id, name, description, prompt, model, expanded, rank,
         created_at, updated_at,
         prompt IS NULL AS is_folder
    FROM agents;--> statement-breakpoint

-- Recreate tasks_v
CREATE VIEW "tasks_v" AS
  WITH task_facts AS (
    SELECT tasks_1.id,
           (EXISTS (SELECT 1 FROM attempts a WHERE a.task_id = tasks_1.id)) AS has_attempt,
           (EXISTS (SELECT 1 FROM attempts_v a WHERE a.task_id = tasks_1.id AND a.status = 'completed')) AS has_completed,
           (EXISTS (SELECT 1 FROM attempts_v a WHERE a.task_id = tasks_1.id AND a.active)) AS has_active,
           (EXISTS (SELECT 1 FROM conversations c JOIN attempts a ON a.id = c.attempt_id WHERE a.task_id = tasks_1.id AND c.status = 'waiting')) AS has_waiting,
           (SELECT MIN(p.created_at) FROM pushes p JOIN attempts a ON a.id = p.attempt_id WHERE a.task_id = tasks_1.id) AS min_completed_push_at
      FROM tasks tasks_1
  )
  SELECT tasks.id, tasks.parent_id, tasks.title, tasks.description, tasks.author,
         tasks.dropped_at, tasks.held_at, tasks.expanded, tasks.rank,
         tasks.created_at, tasks.updated_at,
         CASE
           WHEN tasks.dropped_at IS NOT NULL THEN 'dropped'
           WHEN tasks.held_at IS NOT NULL THEN 'held'
           WHEN task_facts.has_completed THEN 'done'
           WHEN task_facts.has_active AND task_facts.has_waiting THEN 'need_action'
           WHEN task_facts.has_active THEN 'in_progress'
           WHEN task_facts.has_attempt THEN 'attempted'
           ELSE 'new'
         END AS status,
         (tasks.dropped_at IS NULL AND tasks.held_at IS NULL AND NOT task_facts.has_completed AND task_facts.has_active) AS active,
         CASE
           WHEN tasks.dropped_at IS NOT NULL THEN tasks.dropped_at
           WHEN task_facts.has_completed THEN task_facts.min_completed_push_at
           ELSE NULL
         END AS finished_at
    FROM tasks JOIN task_facts ON task_facts.id = tasks.id;
