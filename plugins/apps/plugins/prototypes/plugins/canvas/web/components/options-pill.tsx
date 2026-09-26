import { useState, type ReactElement } from "react";
import { MdLink, MdTune, MdViewColumn } from "react-icons/md";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import {
  Button,
  ControlSizeProvider,
  cn,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/overlay/plugins/popover/web";
import {
  humanizeToken,
  pickedValue,
  type OptionPicks,
  type PrototypeMeta,
  type PrototypeOption,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { documentOptions, useFramePicks, usePrototypeDetail } from "../context";
import { prototypeFrames, type PrototypeFrame } from "../internal/canvas-model";

/**
 * One prototype frame's options, as a pill ("Mist · Home +3") that opens the
 * options popover: one row of chips per declared option, plus per row a
 * link (keep it the same in every frame) and a spread (one frame per value).
 *
 * App DOM, never inside the prototype's page — that is what keeps switchers
 * out of the designs. It always edits ITS frame, so nothing needs
 * disambiguating. Renders nothing for a document with no options. The frame's
 * picks are always known here: the canvas does not exist until they load.
 */
export function OptionsPill({
  frame,
  meta,
}: {
  frame: PrototypeFrame;
  meta: PrototypeMeta;
}): ReactElement | null {
  const [open, setOpen] = useState(false);
  const { dispatch } = usePrototypeDetail();
  const options = documentOptions(meta, frame.version);
  const picks = useFramePicks(frame, meta);
  if (options.length === 0) return null;
  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="center"
      width="builder"
      trigger={
        <Button variant="floating" shape="pill" aria-label="Prototype options">
          <MdTune />
          <PillSummary options={options} picks={picks} />
        </Button>
      }
    >
      <ControlSizeProvider size="xs">
        <Stack gap="sm" role="group" aria-label="Options">
          <PopoverHeading />
          {options.map((option) => (
            <OptionRow
              key={option.name}
              frame={frame}
              option={option}
              value={pickedValue(option, picks)}
              onPick={(value) =>
                dispatch({
                  type: "setPick",
                  id: frame.id,
                  option: option.name,
                  value,
                })
              }
              onClose={() => setOpen(false)}
            />
          ))}
          {Object.keys(picks).length > 0 ? (
            <Button
              variant="ghost"
              onClick={() => dispatch({ type: "resetPicks", id: frame.id })}
            >
              Reset to defaults
            </Button>
          ) : null}
        </Stack>
      </ControlSizeProvider>
    </InlinePopover>
  );
}

/** "Mist · Home" and a dimmed "+3" for the options not named. */
function PillSummary({
  options,
  picks,
}: {
  options: readonly PrototypeOption[];
  picks: OptionPicks;
}): ReactElement {
  const named = options.slice(0, 2);
  const rest = options.length - named.length;
  return (
    <>
      <span className="tabular-nums">
        {named.map((o) => humanizeToken(pickedValue(o, picks))).join(" · ")}
      </span>
      {rest > 0 ? (
        <span className="text-muted-foreground">+{String(rest)}</span>
      ) : null}
    </>
  );
}

/** "Options" and the legend for the row actions. */
function PopoverHeading(): ReactElement {
  const { canvas } = usePrototypeDetail();
  const multi = prototypeFrames(canvas.frames).length > 1;
  return (
    <Stack direction="row" gap="sm" align="center">
      <Text variant="label">Options</Text>
      <Fill />
      <Text variant="caption" tone="faint">
        {multi
          ? "link: same everywhere · columns: spread"
          : "columns: one frame per value"}
      </Text>
    </Stack>
  );
}

/** One option: its name, its values as chips, and the row's link and spread. */
function OptionRow({
  frame,
  option,
  value,
  onPick,
  onClose,
}: {
  frame: PrototypeFrame;
  option: PrototypeOption;
  value: string;
  onPick: (value: string) => void;
  onClose: () => void;
}): ReactElement {
  const { canvas, dispatch } = usePrototypeDetail();
  const multi = prototypeFrames(canvas.frames).length > 1;
  const linked = canvas.linked.has(option.name);
  const spread = canvas.spread === option.name;
  const label = humanizeToken(option.name);

  return (
    <Stack direction="row" gap="sm" align="center">
      <Text variant="caption" tone="muted" className={cn(rigidClass(), "w-20")}>
        {label}
      </Text>
      <Fill>
        <Cluster gap="xs" role="radiogroup" aria-label={label}>
          {option.values.map((v) => (
            <ToggleChip
              key={v}
              role="radio"
              aria-checked={v === value}
              active={v === value}
              // The chip already on screen writes nothing: frame A's write
              // would reach every surface showing this prototype.
              onClick={() => {
                if (v !== value) onPick(v);
              }}
            >
              {humanizeToken(v)}
            </ToggleChip>
          ))}
        </Cluster>
      </Fill>
      <Stack direction="row" gap="none" className={rigidClass()}>
        {multi ? (
          <IconButton
            icon={MdLink}
            label={
              linked
                ? "Same in every frame — click to unlink"
                : "Keep the same in every frame"
            }
            aria-pressed={linked}
            className={linked ? "bg-primary/15 text-primary" : undefined}
            onClick={() =>
              dispatch({ type: "toggleLink", id: frame.id, option })
            }
          />
        ) : null}
        <IconButton
          icon={MdViewColumn}
          label={
            spread
              ? `Gather back into one frame`
              : `One frame per ${label.toLowerCase()}`
          }
          aria-pressed={spread}
          className={spread ? "bg-primary/15 text-primary" : undefined}
          onClick={() => {
            onClose();
            dispatch({ type: "toggleSpread", id: frame.id, option });
          }}
        />
      </Stack>
    </Stack>
  );
}
