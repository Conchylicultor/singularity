import type { ReactElement } from "react";
import { MdClose, MdContentCopy, MdCropSquare } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { usePrototypeDetail } from "../context";
import type { FrameActionRow } from "../slots";

// The canvas's own frame actions, contributed to `PrototypeFrameActions` like
// any other plugin's (Present adds its menu the same way). Keep only and Close
// show only with more than one frame: the canvas never goes empty.

/** Close every other frame — with an Undo toast. */
export function KeepOnlyFrameAction({
  row,
}: ItemActionProps<FrameActionRow>): ReactElement | null {
  const { canvas, keepOnly } = usePrototypeDetail();
  if (canvas.frames.length < 2) return null;
  return (
    <IconButton
      icon={MdCropSquare}
      label="Keep only this frame — close the others"
      onClick={() => keepOnly(row.frame.id)}
    />
  );
}

/** Add a copy of this prototype frame, to change its variant or version. */
export function DuplicateFrameAction({
  row,
}: ItemActionProps<FrameActionRow>): ReactElement | null {
  const { dispatch } = usePrototypeDetail();
  if (row.frame.kind !== "prototype") return null;
  return (
    <IconButton
      icon={MdContentCopy}
      label="Duplicate — then change its variant or version"
      onClick={() => dispatch({ type: "addPrototype", from: row.frame.id })}
    />
  );
}

/** Take this frame off the canvas. */
export function CloseFrameAction({
  row,
}: ItemActionProps<FrameActionRow>): ReactElement | null {
  const { canvas, dispatch } = usePrototypeDetail();
  if (canvas.frames.length < 2) return null;
  return (
    <IconButton
      icon={MdClose}
      label="Remove from canvas"
      onClick={() => dispatch({ type: "remove", id: row.frame.id })}
    />
  );
}
