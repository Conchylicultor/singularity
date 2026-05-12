DO $$ BEGIN
 ALTER TABLE "tasks_ext_auto_start" ADD CONSTRAINT "tasks_ext_auto_start_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
