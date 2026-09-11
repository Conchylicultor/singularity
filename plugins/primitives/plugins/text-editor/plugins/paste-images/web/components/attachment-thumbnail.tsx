import { MdClose } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { hoverRevealTargetWithGroupFocus } from "@plugins/primitives/plugins/hover-reveal/web";
import { ViewerThumbnail } from "@plugins/primitives/plugins/overlay/plugins/image-viewer/web";
import { attachmentUrl } from "../internal/markdown";

export function AttachmentThumbnail({
  attachmentId,
  alt,
  onRemove,
}: {
  attachmentId: string;
  alt?: string;
  onRemove?: () => void;
}) {
  return (
    <ViewerThumbnail
      size="chip"
      image={{
        src: attachmentUrl(attachmentId),
        name: alt || "Pasted image",
        sourceLabel: "Pasted",
        alt: alt || undefined,
      }}
    >
      {onRemove && (
        <Pin to="top-right" offset="xs" outset>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            // Group-focus variant: the thumbnail is its own open button, so
            // keyboard-focusing it should reveal Remove too.
            className={cn(
              hoverRevealTargetWithGroupFocus,
              "bg-background/90 border-border text-foreground block size-4 rounded-full border",
            )}
            aria-label="Remove image"
          >
            <Center className="size-full">
              <MdClose className="size-3" />
            </Center>
          </button>
        </Pin>
      )}
    </ViewerThumbnail>
  );
}
