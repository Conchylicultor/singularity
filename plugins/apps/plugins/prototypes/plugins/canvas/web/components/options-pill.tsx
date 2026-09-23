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
import {
  documentOptions,
  useFramePicks,
  usePrototypeDetail,
  useStoredPicksOf,
} from "../context";
import { prototypeFrames, type PrototypeFrame } from "../internal/canvas-model";
import { letterOf } from "../internal/frame-name";
import { FrameLetter } from "./frame-letter";

/**
 * One prototype frame's options, as a pill ("Mist · Home +3") that opens the
 * options popover — "Options of B": one row of chips per declared option, each
 * value marked with the letters of the OTHER frames showing it, plus per row a
 * link (keep it the same in every frame) and a spread (one frame per value).
 *
 * App DOM, never inside the prototype's page — that is what keeps switchers
 * out of the designs. It always edits ITS frame, so nothing needs
 * disambiguating. Renders nothing for a document with no options, and nothing
 * while the frame's picks are unknown (a pill naming the defaults would claim a
 * choice the user may not have made).
 */
export function OptionsPill({
  frame,
  meta,
}: {
  frame: PrototypeFrame;
  meta: PrototypeMeta;
}): ReactElement | null {
  const [open, setOpen] = useState(false);
  const { canvas, dispatch } = usePrototypeDetail();
  const options = documentOptions(meta, frame.version);
  const read = useFramePicks(frame, meta);
  if (options.length === 0 || read.pending) return null;
  const picks = read.data;
  const index = canvas.frames.findIndex((f) => f.id === frame.id);

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
        <Stack
          gap="sm"
          role="group"
          aria-label={`Options of ${letterOf(index)}`}
        >
          <PopoverHeading index={index} />
          {options.map((option) => (
            <OptionRow
              key={option.name}
              frame={frame}
              meta={meta}
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

/** "B  Options of B" and, with other frames, the legend for the row marks. */
function PopoverHeading({ index }: { index: number }): ReactElement {
  const { canvas } = usePrototypeDetail();
  const multi = prototypeFrames(canvas.frames).length > 1;
  return (
    <Stack direction="row" gap="sm" align="center">
      <FrameLetter index={index} />
      <Text variant="label">Options of {letterOf(index)}</Text>
      <Fill />
      <Text variant="caption" tone="faint">
        {multi
          ? "letters: other frames · link: same everywhere · columns: spread"
          : "columns: one frame per value"}
      </Text>
    </Stack>
  );
}

/** One option: its name, its values as chips, and the row's link and spread. */
function OptionRow({
  frame,
  meta,
  option,
  value,
  onPick,
  onClose,
}: {
  frame: PrototypeFrame;
  meta: PrototypeMeta;
  option: PrototypeOption;
  value: string;
  onPick: (value: string) => void;
  onClose: () => void;
}): ReactElement {
  const { canvas, dispatch } = usePrototypeDetail();
  const picksOf = useStoredPicksOf();
  const protos = prototypeFrames(canvas.frames);
  const multi = protos.length > 1;
  const linked = canvas.linked.has(option.name);
  const spread = canvas.spread === option.name;
  const label = humanizeToken(option.name);

  // Which OTHER frames show each value — only frames whose document declares it.
  const who = (v: string): number[] =>
    protos.flatMap((p) => {
      if (p.id === frame.id) return [];
      const theirs = documentOptions(meta, p.version).find(
        (o) => o.name === option.name,
      );
      if (theirs === undefined || pickedValue(theirs, picksOf(p)) !== v) {
        return [];
      }
      return [canvas.frames.indexOf(p)];
    });

  return (
    <Stack direction="row" gap="sm" align="center">
      <Text variant="caption" tone="muted" className={cn(rigidClass(), "w-20")}>
        {label}
      </Text>
      <Fill>
        <Cluster gap="xs" role="radiogroup" aria-label={label}>
          {option.values.map((v) => {
            const others = multi ? who(v) : [];
            return (
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
                {others.length > 0 ? (
                  <Stack as="span" direction="row" gap="none">
                    {others.map((i) => (
                      <FrameLetter key={i} index={i} small />
                    ))}
                  </Stack>
                ) : null}
              </ToggleChip>
            );
          })}
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
