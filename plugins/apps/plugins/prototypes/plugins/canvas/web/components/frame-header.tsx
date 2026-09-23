import type { ReactElement } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import type { ClassName } from "@plugins/primitives/plugins/css/plugins/ui-kit/core";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";
import type { CanvasFrame } from "../internal/canvas-model";
import { FRAME_HEAD } from "../internal/layout";
import { letterOf } from "../internal/frame-name";
import { PrototypeFrameActions, type FrameResolution } from "../slots";
import { usePrototypeDetail } from "../context";
import { FrameLetter } from "./frame-letter";
import { VersionStepper } from "./version-stepper";

/** The header row's own height; the gap under it makes up `FRAME_HEAD`. */
export const FRAME_HEADER_HEIGHT = 26;
export const FRAME_HEADER_GAP = FRAME_HEAD - FRAME_HEADER_HEIGHT;

/**
 * A frame's header: its letter and name, what it shows (the version stepper for
 * the prototype, the source's tag otherwise), and — revealed on hover, or while
 * it is selected — its actions. One line at a fixed height, so the canvas can
 * subtract it from the room a frame's screen gets.
 */
export function FrameHeader({
  frame,
  index,
  meta,
  name,
  resolution,
  actionsClassName,
}: {
  frame: CanvasFrame;
  index: number;
  meta: PrototypeMeta;
  /** The frame's name ("Mist · Home", "Real app"). */
  name: string;
  /** What a source frame resolved to — `null` for a prototype frame. */
  resolution: FrameResolution | null;
  /** The actions' reveal classes (hover-revealed unless selected). */
  actionsClassName?: ClassName;
}): ReactElement {
  return (
    <ControlSizeProvider size="xs">
      <Line style={{ height: FRAME_HEADER_HEIGHT }}>
        <Stack direction="row" gap="sm" align="center" className="w-full">
          <FrameLetter index={index} />
          <Text variant="label">{name}</Text>
          <span className={rigidClass()}>
            {frame.kind === "prototype" ? (
              <FrameVersion frame={frame} index={index} name={meta.name} />
            ) : resolution?.status === "found" ? (
              <Badge variant="success">{resolution.tag}</Badge>
            ) : null}
          </span>
          <Fill />
          <Stack
            direction="row"
            gap="none"
            align="center"
            className={actionsClassName}
          >
            <PrototypeFrameActions.Row
              row={{ frame, meta }}
              hasChildren={false}
            />
          </Stack>
        </Stack>
      </Line>
    </ControlSizeProvider>
  );
}

/** A prototype frame's own version stepper. */
function FrameVersion({
  frame,
  index,
  name,
}: {
  frame: Extract<CanvasFrame, { kind: "prototype" }>;
  index: number;
  name: string;
}): ReactElement {
  const { dispatch } = usePrototypeDetail();
  return (
    <VersionStepper
      name={name}
      letter={letterOf(index)}
      shown={frame.version}
      show={(version) =>
        dispatch({ type: "setVersion", id: frame.id, version })
      }
    />
  );
}
