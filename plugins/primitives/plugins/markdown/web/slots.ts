import { defineSlot } from "@core";
import type { MarkdownExtension } from "./internal/types";

export const Markdown = {
  Extension: defineSlot<MarkdownExtension>("markdown.extension"),
};
