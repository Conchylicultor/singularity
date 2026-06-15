import { z } from "zod";
import { MdAudiotrack } from "react-icons/md";
import { defineBlock } from "@plugins/page/plugins/editor/core";

export const AUDIO_TYPE = "audio";

export const audioBlock = defineBlock({
  type: AUDIO_TYPE,
  schema: z.object({
    attachmentId: z.string().optional(),
    filename: z.string().optional(),
    mime: z.string().optional(),
  }),
  label: "Audio",
  icon: MdAudiotrack,
  aliases: ["mp3", "sound", "music", "voice", "media"],
  empty: () => ({}), // no attachmentId → placeholder UI
});
