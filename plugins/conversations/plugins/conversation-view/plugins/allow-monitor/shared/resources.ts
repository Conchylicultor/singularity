import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const AllowFilesSchema = z.object({ allowFiles: z.array(z.string()) });
export type AllowFiles = z.infer<typeof AllowFilesSchema>;

// Which guard-bypass files exist at a conversation's worktree root, pushed by a
// file watcher while someone is looking at the conversation.
export const allowFilesResource = resourceDescriptor<
  AllowFiles,
  { id: string }
>("allow-files", AllowFilesSchema, { allowFiles: [] });
