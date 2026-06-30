CREATE TABLE IF NOT EXISTS "mail_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"signature" text,
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mail_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"account_id" text NOT NULL,
	"gmail_attachment_id" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"inline" boolean DEFAULT false NOT NULL,
	"content_id" text,
	"stored_attachment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mail_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"thread_id" text,
	"gmail_draft_id" text,
	"in_reply_to_message_id" text,
	"to_addrs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc_addrs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bcc_addrs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text,
	"body_html" text,
	"body_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mail_labels" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"color" text,
	"text_color" text,
	"parent_id" text,
	"message_list_visibility" text,
	"label_list_visibility" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mail_message_labels" (
	"message_id" text NOT NULL,
	"label_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_message_labels_message_id_label_id_pk" PRIMARY KEY("message_id","label_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mail_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"account_id" text NOT NULL,
	"from_addr" jsonb NOT NULL,
	"to_addrs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc_addrs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bcc_addrs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reply_to" jsonb,
	"subject" text,
	"snippet" text,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body_text" text,
	"body_html" text,
	"internal_date" timestamp with time zone,
	"unread" boolean DEFAULT false NOT NULL,
	"starred" boolean DEFAULT false NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"is_sent" boolean DEFAULT false NOT NULL,
	"size_estimate" integer,
	"history_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mail_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"op_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mail_sync_state" (
	"account_id" text PRIMARY KEY NOT NULL,
	"history_id" text,
	"last_full_sync_at" timestamp with time zone,
	"last_delta_sync_at" timestamp with time zone,
	"status" text DEFAULT 'idle' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mail_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"subject" text,
	"snippet" text,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_message_at" timestamp with time zone,
	"message_count" integer DEFAULT 0 NOT NULL,
	"unread" boolean DEFAULT false NOT NULL,
	"starred" boolean DEFAULT false NOT NULL,
	"important" boolean DEFAULT false NOT NULL,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"label_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"history_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mail_drafts_attachments" (
	"owner_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_drafts_attachments_owner_id_attachment_id_pk" PRIMARY KEY("owner_id","attachment_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_attachments" ADD CONSTRAINT "mail_attachments_message_id_mail_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."mail_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_attachments" ADD CONSTRAINT "mail_attachments_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_drafts" ADD CONSTRAINT "mail_drafts_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_drafts" ADD CONSTRAINT "mail_drafts_thread_id_mail_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."mail_threads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_labels" ADD CONSTRAINT "mail_labels_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_labels" ADD CONSTRAINT "mail_labels_parent_id_mail_labels_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."mail_labels"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_message_labels" ADD CONSTRAINT "mail_message_labels_message_id_mail_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."mail_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_message_labels" ADD CONSTRAINT "mail_message_labels_label_id_mail_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."mail_labels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_thread_id_mail_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."mail_threads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_outbox" ADD CONSTRAINT "mail_outbox_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_sync_state" ADD CONSTRAINT "mail_sync_state_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_drafts_attachments" ADD CONSTRAINT "mail_drafts_attachments_owner_id_mail_drafts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."mail_drafts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_drafts_attachments" ADD CONSTRAINT "mail_drafts_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_attachments_message_id_idx" ON "mail_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_labels_account_id_idx" ON "mail_labels" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_message_labels_label_id_idx" ON "mail_message_labels" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_messages_thread_id_idx" ON "mail_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_messages_account_id_idx" ON "mail_messages" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_outbox_account_status_idx" ON "mail_outbox" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_threads_account_last_msg_idx" ON "mail_threads" USING btree ("account_id","last_message_at");