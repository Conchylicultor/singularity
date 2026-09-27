import { z } from "zod";
import { defineBlock } from "@plugins/page/plugins/editor/core";
import { symbol } from "@plugins/ui/plugins/icons/core";

const movieIcon = symbol("movie");

export const VIDEO_TYPE = "video";

export const videoBlock = defineBlock({
  type: VIDEO_TYPE,
  schema: z.object({
    attachmentId: z.string().optional(),
    filename: z.string().optional(),
    mime: z.string().optional(),
  }),
  label: "Video",
  icon: movieIcon,
  aliases: ["mp4", "movie", "clip", "media"],
  empty: () => ({}), // no attachmentId → placeholder UI
});
