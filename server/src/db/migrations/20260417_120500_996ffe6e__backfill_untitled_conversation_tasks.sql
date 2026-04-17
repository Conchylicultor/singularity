UPDATE "tasks" SET "title" = sub.conv_title, "updated_at" = now()
FROM (
  SELECT DISTINCT ON (a.task_id)
    a.task_id, c.title AS conv_title
  FROM "attempts" a
  JOIN "conversations" c ON c.attempt_id = a.id
  WHERE c.title IS NOT NULL
    AND c.title <> ''
    AND c.title <> 'Untitled conversation'
  ORDER BY a.task_id, a.created_at ASC, c.created_at ASC
) sub
WHERE "tasks".id = sub.task_id
  AND "tasks".title = 'Untitled conversation';
--> statement-breakpoint
UPDATE "tasks" SET "title" = 'Untitled', "updated_at" = now()
WHERE "tasks".title = 'Untitled conversation';
