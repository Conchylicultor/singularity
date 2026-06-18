import { registerBlockPasteHandler } from "@plugins/page/plugins/editor/web";
import { uploadAttachment } from "@plugins/infra/plugins/attachments/web";
import { audioBlock } from "../../core";

// Side-effect: pasting an audio file anywhere in a page creates an
// audio block.
registerBlockPasteHandler({
  id: "audio",
  type: audioBlock.type,
  accept: "audio/*",
  build: async (file) => {
    const res = await uploadAttachment(file, file.name, file.type);
    return { attachmentId: res.id, filename: res.filename, mime: res.mime };
  },
});
