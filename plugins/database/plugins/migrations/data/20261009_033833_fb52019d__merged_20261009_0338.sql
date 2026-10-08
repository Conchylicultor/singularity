-- singularity:phase expand
ALTER TABLE "deploy_servers_ext_health" DROP CONSTRAINT "deploy_servers_ext_health_parent_id_deploy_servers_id_fk";
ALTER TABLE "event_source_run_events" DROP CONSTRAINT "event_source_run_events_run_id_event_source_runs_id_fk";
ALTER TABLE "mail_attachments" DROP CONSTRAINT "mail_attachments_account_id_mail_accounts_id_fk";
ALTER TABLE "mail_drafts" DROP CONSTRAINT "mail_drafts_account_id_mail_accounts_id_fk";
ALTER TABLE "mail_labels" DROP CONSTRAINT "mail_labels_account_id_mail_accounts_id_fk";
ALTER TABLE "mail_messages" DROP CONSTRAINT "mail_messages_account_id_mail_accounts_id_fk";
ALTER TABLE "mail_outbox" DROP CONSTRAINT "mail_outbox_account_id_mail_accounts_id_fk";
ALTER TABLE "mail_sync_state" DROP CONSTRAINT "mail_sync_state_account_id_mail_accounts_id_fk";
ALTER TABLE "mail_threads" DROP CONSTRAINT "mail_threads_account_id_mail_accounts_id_fk";
ALTER TABLE "page_blocks_ext_origin" DROP CONSTRAINT "page_blocks_ext_origin_parent_id_page_blocks_id_fk";
ALTER TABLE "page_blocks_ext_auto_icon" DROP CONSTRAINT "page_blocks_ext_auto_icon_parent_id_page_blocks_id_fk";
ALTER TABLE "page_blocks_ext_starred" DROP CONSTRAINT "page_blocks_ext_starred_parent_id_page_blocks_id_fk";
ALTER TABLE "sonata_songs_ext_playback" DROP CONSTRAINT "sonata_songs_ext_playback_parent_id_sonata_songs_id_fk";
ALTER TABLE "sonata_songs_ext_chord_mode" DROP CONSTRAINT "sonata_songs_ext_chord_mode_parent_id_sonata_songs_id_fk";
ALTER TABLE "sonata_songs_ext_key_auto_detect" DROP CONSTRAINT "sonata_songs_ext_key_auto_detect_parent_id_sonata_songs_id_fk";
ALTER TABLE "sonata_songs_ext_rhythm" DROP CONSTRAINT "sonata_songs_ext_rhythm_parent_id_sonata_songs_id_fk";
ALTER TABLE "sonata_songs_ext_chord_grid" DROP CONSTRAINT "sonata_songs_ext_chord_grid_parent_id_sonata_songs_id_fk";
ALTER TABLE "sonata_songs_ext_midi" DROP CONSTRAINT "sonata_songs_ext_midi_parent_id_sonata_songs_id_fk";
ALTER TABLE "sonata_songs_ext_ug_alignment" DROP CONSTRAINT "sonata_songs_ext_ug_alignment_parent_id_sonata_songs_id_fk";
ALTER TABLE "sonata_songs_ext_ultimate_guitar" DROP CONSTRAINT "sonata_songs_ext_ultimate_guitar_parent_id_sonata_songs_id_fk";
ALTER TABLE "sonata_track_view" DROP CONSTRAINT "sonata_track_view_song_id_sonata_songs_id_fk";
ALTER TABLE "sonata_songs_ext_transpose" DROP CONSTRAINT "sonata_songs_ext_transpose_parent_id_sonata_songs_id_fk";
ALTER TABLE "conversations_ext_preprompt" DROP CONSTRAINT "conversations_ext_preprompt_parent_id_conversations_id_fk";
ALTER TABLE "conversations_ext_progress" DROP CONSTRAINT "conversations_ext_progress_parent_id_conversations_id_fk";
ALTER TABLE "conversations_ext_notes" DROP CONSTRAINT "conversations_ext_notes_parent_id_conversations_id_fk";
ALTER TABLE "conversations_ext_turn_summary" DROP CONSTRAINT "conversations_ext_turn_summary_parent_id_conversations_id_fk";
ALTER TABLE "conversations_ext_queue" DROP CONSTRAINT "conversations_ext_queue_parent_id_conversations_id_fk";
ALTER TABLE "conversations_ext_usage" DROP CONSTRAINT "conversations_ext_usage_parent_id_conversations_id_fk";
ALTER TABLE "page_blocks_ext_todo_task" DROP CONSTRAINT "page_blocks_ext_todo_task_parent_id_page_blocks_id_fk";
ALTER TABLE "page_blocks_attachments" DROP CONSTRAINT "page_blocks_attachments_owner_id_page_blocks_id_fk";
ALTER TABLE "page_blocks_attachments" DROP CONSTRAINT "page_blocks_attachments_attachment_id_attachments_id_fk";
ALTER TABLE "tasks_ext_prompt_block" DROP CONSTRAINT "tasks_ext_prompt_block_parent_id_tasks_id_fk";
ALTER TABLE "tasks_ext_health_review" DROP CONSTRAINT "tasks_ext_health_review_parent_id_tasks_id_fk";
ALTER TABLE "tasks_ext_auto_start" DROP CONSTRAINT "tasks_ext_auto_start_parent_id_tasks_id_fk";
ALTER TABLE "tasks_ext_origin" DROP CONSTRAINT "tasks_ext_origin_parent_id_tasks_id_fk";
ALTER TABLE "tasks_ext_category" DROP CONSTRAINT "tasks_ext_category_parent_id_tasks_id_fk";
ALTER TABLE "tasks_ext_effort" DROP CONSTRAINT "tasks_ext_effort_parent_id_tasks_id_fk";
ALTER TABLE "tasks_ext_preprompt" DROP CONSTRAINT "tasks_ext_preprompt_parent_id_tasks_id_fk";
ALTER TABLE "tasks_ext_source_url" DROP CONSTRAINT "tasks_ext_source_url_parent_id_tasks_id_fk";
ALTER TABLE "tasks_ext_short_title" DROP CONSTRAINT "tasks_ext_short_title_parent_id_tasks_id_fk";
ALTER TABLE "tasks_ext_track" DROP CONSTRAINT "tasks_ext_track_parent_id_tasks_id_fk";
ALTER TABLE "agents_attachments" DROP CONSTRAINT "agents_attachments_owner_id_agents_id_fk";
ALTER TABLE "agents_attachments" DROP CONSTRAINT "agents_attachments_attachment_id_attachments_id_fk";
ALTER TABLE "mail_drafts_attachments" DROP CONSTRAINT "mail_drafts_attachments_owner_id_mail_drafts_id_fk";
ALTER TABLE "mail_drafts_attachments" DROP CONSTRAINT "mail_drafts_attachments_attachment_id_attachments_id_fk";
ALTER TABLE "sonata_songs_attachments" DROP CONSTRAINT "sonata_songs_attachments_owner_id_sonata_songs_id_fk";
ALTER TABLE "sonata_songs_attachments" DROP CONSTRAINT "sonata_songs_attachments_attachment_id_attachments_id_fk";
ALTER TABLE "conversations_attachments" DROP CONSTRAINT "conversations_attachments_owner_id_conversations_id_fk";
ALTER TABLE "conversations_attachments" DROP CONSTRAINT "conversations_attachments_attachment_id_attachments_id_fk";
ALTER TABLE "tasks_attachments" DROP CONSTRAINT "tasks_attachments_owner_id_tasks_id_fk";
ALTER TABLE "tasks_attachments" DROP CONSTRAINT "tasks_attachments_attachment_id_attachments_id_fk";
-- singularity:phase contract
DO $$ BEGIN
 ALTER TABLE "deploy_servers_ext_health" ADD CONSTRAINT "deploy_servers_ext_health_parent_id_deploy_servers_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."deploy_servers"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "event_source_run_events" ADD CONSTRAINT "event_source_run_events_run_id_event_source_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."event_source_runs"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "mail_attachments" ADD CONSTRAINT "mail_attachments_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "mail_drafts" ADD CONSTRAINT "mail_drafts_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "mail_labels" ADD CONSTRAINT "mail_labels_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "mail_outbox" ADD CONSTRAINT "mail_outbox_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "mail_sync_state" ADD CONSTRAINT "mail_sync_state_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "page_blocks_ext_origin" ADD CONSTRAINT "page_blocks_ext_origin_parent_id_page_blocks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "page_blocks_ext_auto_icon" ADD CONSTRAINT "page_blocks_ext_auto_icon_parent_id_page_blocks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "page_blocks_ext_starred" ADD CONSTRAINT "page_blocks_ext_starred_parent_id_page_blocks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "sonata_songs_ext_playback" ADD CONSTRAINT "sonata_songs_ext_playback_parent_id_sonata_songs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "sonata_songs_ext_chord_mode" ADD CONSTRAINT "sonata_songs_ext_chord_mode_parent_id_sonata_songs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "sonata_songs_ext_key_auto_detect" ADD CONSTRAINT "sonata_songs_ext_key_auto_detect_parent_id_sonata_songs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "sonata_songs_ext_rhythm" ADD CONSTRAINT "sonata_songs_ext_rhythm_parent_id_sonata_songs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "sonata_songs_ext_chord_grid" ADD CONSTRAINT "sonata_songs_ext_chord_grid_parent_id_sonata_songs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "sonata_songs_ext_midi" ADD CONSTRAINT "sonata_songs_ext_midi_parent_id_sonata_songs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "sonata_songs_ext_ug_alignment" ADD CONSTRAINT "sonata_songs_ext_ug_alignment_parent_id_sonata_songs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "sonata_songs_ext_ultimate_guitar" ADD CONSTRAINT "sonata_songs_ext_ultimate_guitar_parent_id_sonata_songs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "sonata_track_view" ADD CONSTRAINT "sonata_track_view_song_id_sonata_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "sonata_songs_ext_transpose" ADD CONSTRAINT "sonata_songs_ext_transpose_parent_id_sonata_songs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "conversations_ext_preprompt" ADD CONSTRAINT "conversations_ext_preprompt_parent_id_conversations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "conversations_ext_progress" ADD CONSTRAINT "conversations_ext_progress_parent_id_conversations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "conversations_ext_notes" ADD CONSTRAINT "conversations_ext_notes_parent_id_conversations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "conversations_ext_turn_summary" ADD CONSTRAINT "conversations_ext_turn_summary_parent_id_conversations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "conversations_ext_queue" ADD CONSTRAINT "conversations_ext_queue_parent_id_conversations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "conversations_ext_usage" ADD CONSTRAINT "conversations_ext_usage_parent_id_conversations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "page_blocks_ext_todo_task" ADD CONSTRAINT "page_blocks_ext_todo_task_parent_id_page_blocks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "page_blocks_attachments" ADD CONSTRAINT "page_blocks_attachments_owner_id_page_blocks_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."page_blocks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "page_blocks_attachments" ADD CONSTRAINT "page_blocks_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "tasks_ext_prompt_block" ADD CONSTRAINT "tasks_ext_prompt_block_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "tasks_ext_health_review" ADD CONSTRAINT "tasks_ext_health_review_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "tasks_ext_auto_start" ADD CONSTRAINT "tasks_ext_auto_start_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "tasks_ext_origin" ADD CONSTRAINT "tasks_ext_origin_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "tasks_ext_category" ADD CONSTRAINT "tasks_ext_category_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "tasks_ext_effort" ADD CONSTRAINT "tasks_ext_effort_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "tasks_ext_preprompt" ADD CONSTRAINT "tasks_ext_preprompt_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "tasks_ext_source_url" ADD CONSTRAINT "tasks_ext_source_url_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "tasks_ext_short_title" ADD CONSTRAINT "tasks_ext_short_title_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "tasks_ext_track" ADD CONSTRAINT "tasks_ext_track_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "agents_attachments" ADD CONSTRAINT "agents_attachments_owner_id_agents_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "agents_attachments" ADD CONSTRAINT "agents_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "mail_drafts_attachments" ADD CONSTRAINT "mail_drafts_attachments_owner_id_mail_drafts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."mail_drafts"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "mail_drafts_attachments" ADD CONSTRAINT "mail_drafts_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "sonata_songs_attachments" ADD CONSTRAINT "sonata_songs_attachments_owner_id_sonata_songs_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."sonata_songs"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "sonata_songs_attachments" ADD CONSTRAINT "sonata_songs_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "conversations_attachments" ADD CONSTRAINT "conversations_attachments_owner_id_conversations_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "conversations_attachments" ADD CONSTRAINT "conversations_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "tasks_attachments" ADD CONSTRAINT "tasks_attachments_owner_id_tasks_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "tasks_attachments" ADD CONSTRAINT "tasks_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
-- singularity:claims
