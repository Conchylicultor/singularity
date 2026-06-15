import { z } from "zod";
import { MdMovie } from "react-icons/md";
import { defineBlock } from "@plugins/page/plugins/editor/core";

export const VIDEO_TYPE = "video";

export const videoBlock = defineBlock({
  type: VIDEO_TYPE,
  schema: z.object({
    attachmentId: z.string().optional(),
    filename: z.string().optional(),
    mime: z.string().optional(),
  }),
  label: "Video",
  icon: MdMovie,
  aliases: ["mp4", "movie", "clip", "media"],
  empty: () => ({}), // no attachmentId → placeholder UI
});
