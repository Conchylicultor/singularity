import { useState, type ReactNode } from "react";
import { MdCalendarToday, MdExpandMore } from "react-icons/md";
import type { FilterValueInputProps } from "@plugins/primitives/plugins/data-view/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { SectionLabel, Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Button, Separator } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { DateRange, RelativeRange } from "../internal/date-filter-logic";
import {
  formatAnchor,
  type DateAnchor,
  type DateUnit,
} from "../internal/date-anchor";

// Shared native-control chrome (matches the prior date-filter inputs and the
// Input primitive's border/bg/radius — native inputs are exempt from
// no-adhoc-control, which only fingerprints styled <button>/<a>).
const NATIVE_CONTROL =
  "rounded-md border border-input bg-background px-xs py-2xs text-body";

const UNIT_OPTIONS: { value: DateUnit; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

/** Normalize a stored operand into a `DateAnchor` (or undefined for none). */
function toAnchor(value: unknown): DateAnchor | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "string") return { kind: "date", iso: value };
  return value as DateAnchor;
}

const PRESETS: { label: string; anchor: DateAnchor }[] = [
  { label: "Today", anchor: { kind: "relative", unit: "day", amount: 0 } },
  { label: "Yesterday", anchor: { kind: "relative", unit: "day", amount: -1 } },
  { label: "Tomorrow", anchor: { kind: "relative", unit: "day", amount: 1 } },
];

/**
 * The relative-magnitude + unit + direction builder, shared by the anchor
 * chooser's "custom relative" row. Emits a signed `{kind:"relative"}` anchor.
 */
function RelativeAnchorBuilder({
  anchor,
  onChange,
}: {
  anchor?: DateAnchor;
  onChange: (anchor: DateAnchor) => void;
}): ReactNode {
  const relative = anchor?.kind === "relative" ? anchor : undefined;
  const unit = relative?.unit ?? "day";
  const magnitude = relative ? Math.abs(relative.amount) : 1;
  const direction = relative && relative.amount < 0 ? "ago" : "from-now";

  function emit(next: { magnitude?: number; unit?: DateUnit; direction?: string }) {
    const m = next.magnitude ?? magnitude;
    const u = next.unit ?? unit;
    const d = next.direction ?? direction;
    onChange({ kind: "relative", unit: u, amount: d === "ago" ? -m : m });
  }

  return (
    <Stack direction="row" gap="xs" align="center" wrap>
      <input
        type="number"
        min={1}
        className={`${NATIVE_CONTROL} w-16`}
        value={magnitude}
        onChange={(e) => emit({ magnitude: Math.max(1, Number(e.target.value) || 1) })}
      />
      <select
        className={NATIVE_CONTROL}
        value={unit}
        onChange={(e) => emit({ unit: e.target.value as DateUnit })}
      >
        {UNIT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        className={NATIVE_CONTROL}
        value={direction}
        onChange={(e) => emit({ direction: e.target.value })}
      >
        <option value="ago">ago</option>
        <option value="from-now">from now</option>
      </select>
    </Stack>
  );
}

/**
 * The popover-driven anchor chooser used by single and range date inputs.
 * Presets (Today/Yesterday/Tomorrow), a custom-relative builder, and an exact
 * date picker — each writes a `DateAnchor`.
 */
function AnchorChooser({
  anchor,
  onChange,
  placeholder = "Select date",
}: {
  anchor?: DateAnchor;
  onChange: (anchor: DateAnchor) => void;
  placeholder?: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const label = formatAnchor(anchor);
  const exactIso = anchor?.kind === "date" ? anchor.iso : "";

  function pick(next: DateAnchor) {
    onChange(next);
    setOpen(false);
  }

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      contentClassName="w-64"
      trigger={
        <Button variant="outline">
          <MdCalendarToday />
          {label ? (
            <Text variant="body">{label}</Text>
          ) : (
            <Text variant="body" tone="muted">
              {placeholder}
            </Text>
          )}
          <MdExpandMore />
        </Button>
      }
    >
      <Inset pad="sm">
        <Stack gap="sm">
          <Stack gap="2xs">
            <SectionLabel>Relative</SectionLabel>
            {PRESETS.map((p) => (
              <Row
                key={p.label}
                size="sm"
                hover="muted"
                onClick={() => pick(p.anchor)}
              >
                {p.label}
              </Row>
            ))}
            <Inset y="2xs">
              <RelativeAnchorBuilder anchor={anchor} onChange={onChange} />
            </Inset>
          </Stack>
          <Separator />
          <Stack gap="2xs">
            <SectionLabel>Exact date</SectionLabel>
            <input
              type="date"
              className={NATIVE_CONTROL}
              value={exactIso}
              onChange={(e) =>
                e.target.value && pick({ kind: "date", iso: e.target.value })
              }
            />
          </Stack>
        </Stack>
      </Inset>
    </InlinePopover>
  );
}

/** Single anchor chooser for the day-comparison operators (is / before / …). */
export function DateValueInput(props: FilterValueInputProps): ReactNode {
  const anchor = toAnchor(props.value);
  return (
    <AnchorChooser anchor={anchor} onChange={(next) => props.onChange(next)} />
  );
}

/** Two anchor choosers forming an inclusive [from, to] range for `is-between`. */
export function DateRangeInput(props: FilterValueInputProps): ReactNode {
  const range = (props.value ?? {}) as DateRange;

  function update(patch: Partial<DateRange>) {
    props.onChange({ ...range, ...patch });
  }

  return (
    <Stack direction="row" gap="xs" align="center">
      <AnchorChooser
        anchor={toAnchor(range.from)}
        onChange={(next) => update({ from: next })}
        placeholder="Start"
      />
      <Text variant="body" tone="muted">
        –
      </Text>
      <AnchorChooser
        anchor={toAnchor(range.to)}
        onChange={(next) => update({ to: next })}
        placeholder="End"
      />
    </Stack>
  );
}

/**
 * Relative magnitude + unit builder for the within operators (`is within the
 * past/next`). Emits `{unit, amount}` with a positive magnitude; direction is
 * implied by the operator. Defaults to `1 week`.
 */
export function RelativeRangeInput(props: FilterValueInputProps): ReactNode {
  const range = (props.value ?? {}) as Partial<RelativeRange>;
  const unit = range.unit ?? "week";
  const amount =
    typeof range.amount === "number" && range.amount > 0 ? range.amount : 1;

  function emit(next: { amount?: number; unit?: DateUnit }) {
    props.onChange({
      unit: next.unit ?? unit,
      amount: next.amount ?? amount,
    } satisfies RelativeRange);
  }

  return (
    <Stack direction="row" gap="xs" align="center">
      <input
        type="number"
        min={1}
        className={`${NATIVE_CONTROL} w-16`}
        value={amount}
        onChange={(e) => emit({ amount: Math.max(1, Number(e.target.value) || 1) })}
      />
      <select
        className={NATIVE_CONTROL}
        value={unit}
        onChange={(e) => emit({ unit: e.target.value as DateUnit })}
      >
        {UNIT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Stack>
  );
}
