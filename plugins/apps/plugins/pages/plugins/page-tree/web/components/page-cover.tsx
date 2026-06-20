import { useRef, useState } from "react";
import { MdSwapVert, MdImage, MdDelete, MdCheck, MdClose } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  pagesResource,
  updateBlock,
  pageData,
  type Block,
  type PageCover,
} from "@plugins/page/plugins/editor/core";
import { attachmentUrl } from "@plugins/primitives/plugins/text-editor/plugins/paste-images/web";
import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { hoverRevealGroup, hoverRevealTarget } from "@plugins/primitives/plugins/hover-reveal/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { gradientCss } from "./cover-presets";
import { ChangeCoverPopover } from "./change-cover-popover";

/**
 * The page cover band, full-bleed above the content column. Renders nothing
 * when no cover is set — the "Add cover" entry point lives in the header's
 * hover-affordance row, so the resting state stays clean (no empty band). With
 * a cover it renders the gradient/image, plus hover controls to change,
 * reposition (images only), or remove it.
 */
export function PageCover({ pageId }: { pageId: string }) {
  const result = useResource(pagesResource);
  if (result.pending) return null;
  const page = result.data.find((d) => d.id === pageId);
  if (!page) return null;
  return <PageCoverInner page={page} pageId={pageId} />;
}

function PageCoverInner({ page, pageId }: { page: Block; pageId: string }) {
  const data = pageData(page);
  const cover = data.cover ?? null;
  const { mutateAsync } = useEndpointMutation(updateBlock);

  const saveCover = async (next: PageCover | null) => {
    await mutateAsync({
      params: { id: pageId },
      body: { data: { ...pageData(page), cover: next } },
    });
  };

  if (!cover) return null;

  return <FilledCover cover={cover} onPick={saveCover} onSave={saveCover} />;
}

function FilledCover({
  cover,
  onPick,
  onSave,
}: {
  cover: PageCover;
  onPick: (cover: PageCover) => void;
  onSave: (cover: PageCover | null) => Promise<void>;
}) {
  const [repositioning, setRepositioning] = useState(false);

  return (
    <Clip className={cn(hoverRevealGroup, "group/cover relative h-[30vh] max-h-64 w-full select-none")}>
      {cover.type === "gradient" ? (
        <div className="size-full" style={{ background: gradientCss(cover.preset) }} />
      ) : (
        <CoverImage cover={cover} repositioning={repositioning} onSave={onSave} onDone={() => setRepositioning(false)} />
      )}

      {!repositioning && (
        <Pin to="bottom-right" offset="md" className={hoverRevealTarget}>
          <Stack direction="row" gap="xs">
            <ChangeCoverPopover
              current={cover}
              onPick={onPick}
              trigger={
                <Button variant="secondary">
                  <MdImage />
                  Change cover
                </Button>
              }
            />
            {cover.type === "image" && (
              <Button variant="secondary" onClick={() => setRepositioning(true)}>
                <MdSwapVert />
                Reposition
              </Button>
            )}
            <Button
              variant="secondary"
              aria-label="Remove cover"
              onClick={() => void onSave(null)}
            >
              <MdDelete />
            </Button>
          </Stack>
        </Pin>
      )}
    </Clip>
  );
}

/**
 * The image cover, with an opt-in vertical reposition mode. While
 * repositioning, a vertical pointer drag adjusts the local `positionY` (0-100,
 * applied as `object-position` Y%). Pointer capture keeps the drag bound to the
 * element — no window-level listeners left mounted. Save commits; Cancel
 * reverts to the persisted value.
 */
function CoverImage({
  cover,
  repositioning,
  onSave,
  onDone,
}: {
  cover: Extract<PageCover, { type: "image" }>;
  repositioning: boolean;
  onSave: (cover: PageCover | null) => Promise<void>;
  onDone: () => void;
}) {
  const [localY, setLocalY] = useState(cover.positionY);
  const dragRef = useRef<{ startClientY: number; startY: number; height: number } | null>(null);

  const positionY = repositioning ? localY : cover.positionY;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!repositioning) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    dragRef.current = {
      startClientY: e.clientY,
      startY: localY,
      height: el.clientHeight,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    // Drag up reveals lower part of the image (increase Y%); scale the pixel
    // delta to the band height so a full-band drag covers the full 0-100 range.
    const delta = ((e.clientY - drag.startClientY) / Math.max(drag.height, 1)) * 100;
    const next = Math.min(100, Math.max(0, drag.startY + delta));
    setLocalY(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  };

  const save = async () => {
    await onSave({ ...cover, positionY: localY });
    onDone();
  };

  const cancel = () => {
    setLocalY(cover.positionY);
    onDone();
  };

  return (
    <>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={cn("size-full", repositioning && "cursor-grab active:cursor-grabbing")}
      >
        <img
          src={attachmentUrl(cover.attachmentId)}
          alt=""
          draggable={false}
          className="pointer-events-none size-full object-cover"
          style={{ objectPosition: `50% ${positionY}%` }}
        />
      </div>

      {repositioning && (
        <>
          <Pin to="top" offset="md" stretch decorative>
            <Center axis="horizontal">
              <Text
                as="span"
                variant="caption"
                className="rounded-md bg-black/60 px-sm py-2xs text-white"
              >
                Drag image to reposition
              </Text>
            </Center>
          </Pin>
          <Pin to="bottom-right" offset="md">
            <Stack direction="row" gap="xs">
              <Button variant="secondary" onClick={cancel}>
                <MdClose />
                Cancel
              </Button>
              <Button variant="default" onClick={() => void save()}>
                <MdCheck />
                Save
              </Button>
            </Stack>
          </Pin>
        </>
      )}
    </>
  );
}
