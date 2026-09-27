import { z } from "zod";
import { defineBlock } from "@plugins/page/plugins/editor/core";
import { symbol } from "@plugins/ui/plugins/icons/core";

const musicNoteIcon = symbol("music-note");

export const AUDIO_TYPE = "audio";

export const audioBlock = defineBlock({
  type: AUDIO_TYPE,
  schema: z.object({
    attachmentId: z.string().optional(),
    filename: z.string().optional(),
    mime: z.string().optional(),
  }),
  label: "Audio",
  icon: musicNoteIcon,
  aliases: ["mp3", "sound", "music", "voice", "media"],
  empty: () => ({}), // no attachmentId → placeholder UI
});
