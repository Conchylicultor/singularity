DROP VIEW IF EXISTS "tasks_v";--> statement-breakpoint
CREATE VIEW "tasks_v" AS (
  WITH task_facts AS (
    SELECT tasks.id,
      EXISTS (SELECT 1 FROM attempts a WHERE a.task_id = tasks.id) AS has_attempt,
      EXISTS (SELECT 1 FROM attempts_v a WHERE a.task_id = tasks.id AND a.status = 'completed') AS has_completed,
      EXISTS (SELECT 1 FROM attempts_v a WHERE a.task_id = tasks.id AND a.active) AS has_active,
      EXISTS (SELECT 1 FROM conversations c JOIN attempts a ON a.id = c.attempt_id WHERE a.task_id = tasks.id AND c.status = 'waiting') AS has_waiting,
      (SELECT min(p.created_at) FROM pushes p JOIN attempts a ON a.id = p.attempt_id WHERE a.task_id = tasks.id) AS min_completed_push_at,
      EXISTS (SELECT 1 FROM task_dependencies td JOIN tasks dep ON dep.id = td.depends_on_task_id WHERE td.task_id = tasks.id AND dep.dropped_at IS NULL AND NOT EXISTS (SELECT 1 FROM attempts_v a WHERE a.task_id = dep.id AND a.status = 'completed')) AS has_blocking_dep
    FROM tasks
  )
  SELECT tasks.id, tasks.parent_id, tasks.group_id, tasks.title, tasks.description, tasks.author,
    tasks.dropped_at, tasks.held_at, tasks.expanded, tasks.rank, tasks.created_at, tasks.updated_at,
    CASE
      WHEN task_facts.has_completed THEN 'done'
      WHEN task_facts.has_active AND task_facts.has_blocking_dep THEN 'blocked'
      WHEN task_facts.has_active AND task_facts.has_waiting THEN 'need_action'
      WHEN task_facts.has_active THEN 'in_progress'
      WHEN tasks.dropped_at IS NOT NULL THEN 'dropped'
      WHEN tasks.held_at IS NOT NULL THEN 'held'
      WHEN task_facts.has_blocking_dep THEN 'blocked'
      WHEN task_facts.has_attempt THEN 'attempted'
      ELSE 'new'
    END AS status,
    (NOT task_facts.has_completed AND task_facts.has_active) AS active,
    CASE
      WHEN task_facts.has_completed THEN task_facts.min_completed_push_at
      WHEN tasks.dropped_at IS NOT NULL THEN tasks.dropped_at
      ELSE NULL::timestamp with time zone
    END AS finished_at,
    COALESCE(ARRAY(SELECT td.depends_on_task_id FROM task_dependencies td WHERE td.task_id = tasks.id ORDER BY td.created_at), ARRAY[]::text[]) AS dependencies
  FROM tasks JOIN task_facts ON task_facts.id = tasks.id
);
