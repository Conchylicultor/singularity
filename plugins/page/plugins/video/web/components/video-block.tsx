import { MdMovie, MdSwapHoriz } from "react-icons/md";
import { AttachmentUpload } from "@plugins/page/plugins/attachment-block/web";
import { attachmentUrl } from "@plugins/primitives/plugins/text-editor/plugins/paste-images/web";
import type { BlockRendererProps } from "@plugins/page/plugins/editor/web";
import { videoBlock } from "../../core";

export function VideoBlock({ block, isFocused, editor }: BlockRendererProps) {
  const { attachmentId } = videoBlock.parse(block.data);

  if (!attachmentId) {
    return (
      <AttachmentUpload
        accept="video/*"
        label="Add a video — click, drop, or paste"
        icon={MdMovie}
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
        <video
          controls
          src={attachmentUrl(attachmentId)}
          className="w-full max-w-full rounded-md"
        />
        <button
          type="button"
          aria-label="Replace video"
          onClick={() => editor.update({})}
          className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70"
        >
          <MdSwapHoriz className="size-4" />
        </button>
      </div>
    </div>
  );
}
