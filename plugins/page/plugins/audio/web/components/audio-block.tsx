import { MdAudiotrack, MdSwapHoriz } from "react-icons/md";
import { AttachmentUpload } from "@plugins/page/plugins/attachment-block/web";
import { attachmentUrl } from "@plugins/primitives/plugins/text-editor/plugins/paste-images/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import type { BlockRendererProps } from "@plugins/page/plugins/editor/web";
import { audioBlock } from "../../core";

export function AudioBlock({ block, isFocused, editor }: BlockRendererProps) {
  const { attachmentId } = audioBlock.parse(block.data);

  if (!attachmentId) {
    return (
      <AttachmentUpload
        accept="audio/*"
        label="Add audio — click, drop, or paste"
        icon={MdAudiotrack}
        isFocused={isFocused}
        onArm={() => editor.onFocus()}
        onUploaded={(res) =>
          editor.update({ attachmentId: res.id, filename: res.filename, mime: res.mime })
        }
      />
    );
  }

  return (
    <div className="px-md py-xs">
      <div className="group relative">
        <audio controls src={attachmentUrl(attachmentId)} className="w-full" />
        <Pin to="top-right" offset="xs">
          <button
            type="button"
            aria-label="Replace audio"
            onClick={() => editor.update({})}
            className="size-6 rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70"
          >
            <Center className="size-full">
              <MdSwapHoriz className="size-4" />
            </Center>
          </button>
        </Pin>
      </div>
    </div>
  );
}
