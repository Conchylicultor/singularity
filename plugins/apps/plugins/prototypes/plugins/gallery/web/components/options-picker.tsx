import { MdTune } from "react-icons/md";
import {
  FloatingAction,
  FloatingActionFadeIn,
} from "@plugins/primitives/plugins/overlay/plugins/floating-action/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  humanizeToken,
  pickedValue,
  type PrototypeMeta,
  type PrototypeOption,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import {
  usePrototypeDetail,
  usePrototypeOptions,
  usePrototypePicks,
} from "../context";
import {
  FRAME_SIZE_LABELS,
  FRAME_SIZES,
  useFrameSizeChoice,
  type FrameSizeChoice,
} from "../frame-size";

/**
 * The picker for a prototype's declared options (`<meta name="prototype-option">`).
 *
 * It is drawn HERE, by the app, over the stage — never inside the prototype's
 * page. That is the whole point: an agent building a prototype declares its
 * variants and designs nothing to switch them, so the design stays the design.
 * Being app DOM, the picker is in no screenshot or thumbnail of the prototype,
 * and the prototype's CSS cannot reach it.
 *
 * At rest it is a small pill naming what you are looking at ("Azure · Soft
 * tray"). Hover, focus or a tap expands it into one row of chips per option —
 * chips, not a dropdown, because a dropdown's menu renders in a portal outside
 * the hover box and moving the pointer into it would close the panel under it.
 * A pick is written to the prototype's one shared record of picks (every
 * surface showing it follows, live); the frame's `src` carries them, so the
 * frame reloads on the new variant.
 *
 * The chips are the options of the document ON SCREEN
 * (`usePrototypeOptions`): on a recorded version, the ones that version
 * declared — so a variant the live page has since dropped is still there to
 * pick.
 *
 * Under the declared options sits one row the app owns rather than the page:
 * **Size** — fixed (the declared viewport), mobile, or full (the frame fills
 * the stage and the page's own responsive layout shows). It is offered only
 * where a frame renders through the nearest frame-size scope
 * (`useFrameSizeChoice`), and the pill's summary ends with it.
 *
 * Renders nothing when there is neither an option nor a Size row, and nothing while
 * the picks are unknown — the stage under it is still loading then, and a pill
 * naming the defaults would claim a choice the user may not have made.
 */
export function OptionsPicker({ meta }: { meta: PrototypeMeta }) {
  const { setPick, resetPicks } = usePrototypeDetail();
  const options = usePrototypeOptions(meta);
  const read = usePrototypePicks(meta);
  const frameSize = useFrameSizeChoice();
  if ((options.length === 0 && frameSize === null) || read.pending) {
    return null;
  }
  const picks = read.data;
  const summary = [
    ...options.map((o) => humanizeToken(pickedValue(o, picks))),
    ...(frameSize ? [FRAME_SIZE_LABELS[frameSize.size]] : []),
  ].join(" · ");

  return (
    <FloatingAction
      className="relative"
      anchor="bottom-right"
      // The rows open ABOVE the pill, which stays flush in the corner.
      direction="col"
      triggerAt="end"
      align="end"
      gap="sm"
      pad="sm"
      label="Prototype options"
      trigger={
        <Stack direction="row" gap="xs" align="center">
          <MdTune className="size-4 text-muted-foreground" />
          <Text variant="caption">{summary}</Text>
        </Stack>
      }
    >
      <FloatingActionFadeIn>
        {/* Collapsed to nothing while closed, so the pill's footprint is the
            pill; capped when open so a long option wraps its chips instead of
            stretching the panel across the stage. */}
        <Clip className="max-h-0 max-w-0 transition-[max-width,max-height] duration-200 group-data-open/fa:max-h-[40rem] group-data-open/fa:max-w-[28rem]">
          <Stack direction="col" gap="md">
            {options.map((option) => (
              <OptionRow
                key={option.name}
                option={option}
                value={pickedValue(option, picks)}
                onPick={(value) => {
                  // The chip already on screen: nothing to write, and a write
                  // would reach every surface showing this prototype.
                  if (value !== pickedValue(option, picks)) {
                    setPick(option.name, value);
                  }
                }}
              />
            ))}
            {frameSize ? <SizeRow choice={frameSize} /> : null}
            {Object.keys(picks).length > 0 ? (
              <Button variant="ghost" onClick={resetPicks}>
                Reset to defaults
              </Button>
            ) : null}
          </Stack>
        </Clip>
      </FloatingActionFadeIn>
    </FloatingAction>
  );
}

/** One option: its name, and a wrapping single-select row of its values. */
function OptionRow({
  option,
  value,
  onPick,
}: {
  option: PrototypeOption;
  value: string;
  onPick: (value: string) => void;
}) {
  const label = humanizeToken(option.name);
  return (
    <Stack direction="col" gap="2xs">
      <Text variant="label">{label}</Text>
      <Cluster gap="xs" role="radiogroup" aria-label={label}>
        {option.values.map((v) => (
          <ToggleChip
            key={v}
            role="radio"
            aria-checked={v === value}
            active={v === value}
            onClick={() => onPick(v)}
          >
            {humanizeToken(v)}
          </ToggleChip>
        ))}
      </Cluster>
    </Stack>
  );
}

/**
 * The frame size: app state, not one of the page's options — it changes the
 * box the page renders in, not the page, so it is never written to the picks
 * record or the frame's URL.
 */
function SizeRow({ choice }: { choice: FrameSizeChoice }) {
  return (
    <Stack direction="col" gap="2xs">
      <Text variant="label">Size</Text>
      <Cluster gap="xs" role="radiogroup" aria-label="Size">
        {FRAME_SIZES.map((size) => (
          <ToggleChip
            key={size}
            role="radio"
            aria-checked={size === choice.size}
            active={size === choice.size}
            onClick={() => choice.setSize(size)}
          >
            {FRAME_SIZE_LABELS[size]}
          </ToggleChip>
        ))}
      </Cluster>
    </Stack>
  );
}
