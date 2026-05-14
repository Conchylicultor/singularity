import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { MarkdownExtension } from "./internal/types";

export const Markdown = {
  Extension: defineSlot<MarkdownExtension>("markdown.extension"),
};
