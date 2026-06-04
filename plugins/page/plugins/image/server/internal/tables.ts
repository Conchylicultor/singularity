import { Attachments } from "@plugins/infra/plugins/attachments/server";
import { _blocks } from "@plugins/page/plugins/editor/server";

// Block ↔ attachment link (creates `page_blocks_attachments`, composite PK, FK
// cascade both sides). Mirrors tasks-core/server/internal/schema-attachments.ts.
export const imageBlockAttachments = Attachments.defineLink(_blocks);
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it up.
// The leading `_` and the `internal/` location keep cross-plugin imports
// impossible — only the handle is barrel-exported.
export const _imageBlockAttachmentsTable = imageBlockAttachments.table;
