import { defineCommand } from "@core";

export interface OpenWithAttachmentsArgs {
  attachmentIds: string[];
  /** Optional filenames keyed by attachment id, used to render chips. */
  filenames?: Record<string, string>;
}

export const Improve = {
  OpenWithAttachments: defineCommand<OpenWithAttachmentsArgs, void>(
    "improve.openWithAttachments",
  ),
};
